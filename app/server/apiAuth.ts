import { eq } from 'drizzle-orm'
import { auth } from '~/lib/auth'
import { db, schema } from './db'
import { withSessionOverride } from './session.server'
import type { SessionContext, WorkspaceRole } from './types'

export type ApiAuthContext = {
  userId: string
  workspaceId: string
  workspaceSlug: string
  role: WorkspaceRole
  viaApiKey: boolean
}

export type ApiAuthFailure =
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden'; reason: 'no_access' | 'workspace_not_found' }
  | { kind: 'invalid_key' }

export type ApiAuthResult = { ok: true; ctx: ApiAuthContext } | { ok: false; err: ApiAuthFailure }

/**
 * Authenticate an API v1 request.
 *
 * Strategy:
 *   1. Try Better Auth's getSession first. With the apiKey plugin configured
 *      to treat bearer tokens as sessions, this resolves the underlying user
 *      for both cookie-based and API-key-based callers in one call.
 *   2. Fall back to a direct verifyApiKey for unusual cases where the
 *      session middleware didn't engage.
 *   3. Resolve the workspace via an explicit slug (query string /
 *      X-Workspace-Slug / arg), defaulting to the user's single workspace
 *      if they only belong to one.
 */
export async function authenticateApiRequest(
  request: Request,
  explicitSlug?: string | null,
): Promise<ApiAuthResult> {
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null)

  let userId: string | null = session?.user?.id ?? null
  let viaApiKey = false

  if (!userId) {
    const headerValue =
      request.headers.get('authorization') ?? request.headers.get('Authorization')
    const raw = headerValue?.toLowerCase().startsWith('bearer ')
      ? headerValue.slice('bearer '.length).trim()
      : (request.headers.get('x-api-key') ?? null)
    if (raw) {
      const verified = (await auth.api
        .verifyApiKey({ body: { key: raw } })
        .catch(() => null)) as
        | { valid?: boolean; key?: { userId?: string } | null }
        | null
      if (verified?.valid && verified.key?.userId) {
        userId = verified.key.userId
        viaApiKey = true
      } else {
        return { ok: false, err: { kind: 'invalid_key' } }
      }
    }
  }

  if (!userId) return { ok: false, err: { kind: 'unauthenticated' } }

  const url = new URL(request.url)
  const slug =
    explicitSlug ??
    url.searchParams.get('workspaceSlug') ??
    request.headers.get('x-workspace-slug')

  const memberships = await db
    .select({
      id: schema.workspaces.id,
      slug: schema.organization.slug,
      role: schema.member.role,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.organizationId, schema.organization.id),
    )
    .where(eq(schema.member.userId, userId))

  let target: (typeof memberships)[number] | null = null
  if (slug) target = memberships.find((m) => m.slug === slug) ?? null
  else if (memberships.length === 1) target = memberships[0]!

  if (!target) {
    if (memberships.length === 0) {
      return { ok: false, err: { kind: 'forbidden', reason: 'no_access' } }
    }
    return { ok: false, err: { kind: 'forbidden', reason: 'workspace_not_found' } }
  }

  return {
    ok: true,
    ctx: {
      userId,
      workspaceId: target.id,
      workspaceSlug: target.slug,
      role: target.role as WorkspaceRole,
      viaApiKey,
    },
  }
}

export function apiError(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ error: { code, message, ...(extra ?? {}) } }, { status })
}

export function apiResponse(data: unknown, meta?: Record<string, unknown>): Response {
  return Response.json({ data, meta: meta ?? null })
}

/**
 * Wraps handler execution in a session-context override so the shared
 * `*.server.ts` impls (which expect a Better Auth session) treat the API
 * caller as if they were signed in through the browser.
 */
export async function withApiAuth<T>(ctx: ApiAuthContext, fn: () => Promise<T>): Promise<T> {
  const session: SessionContext = {
    user: {
      id: ctx.userId,
      email: '',
      name: ctx.viaApiKey ? 'API key' : 'session',
      image: null,
    },
    workspaces: [
      {
        id: ctx.workspaceId,
        name: '',
        slug: ctx.workspaceSlug,
        logoUrl: null,
        appName: null,
        role: ctx.role,
      },
    ],
  }
  return withSessionOverride(session, fn)
}

export function authFailureToResponse(err: ApiAuthFailure): Response {
  if (err.kind === 'unauthenticated') {
    return apiError('UNAUTHENTICATED', 'Missing or invalid credentials', 401)
  }
  if (err.kind === 'invalid_key') {
    return apiError('INVALID_API_KEY', 'API key not recognized', 401)
  }
  return apiError('FORBIDDEN', 'Workspace not accessible', 403)
}

// Redis-backed fixed-window rate limiter, keyed by workspace. Falls back
// to an in-memory bucket when REDIS_URL is unset (dev without compose).
// The API Key plugin itself also supports per-key limits at the Better
// Auth layer; this is a second safety net shared across web replicas.
const buckets = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 100
const WINDOW_MS = 60_000

type RateResult = { ok: boolean; remaining: number; resetInMs: number }

export async function rateLimit(key: string): Promise<RateResult> {
  if (process.env.REDIS_URL) {
    try {
      const { getRedis } = await import('./queues/connection')
      const redis = getRedis()
      const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / WINDOW_MS)}`
      // INCR + PEXPIRE on first bump — atomically sets TTL only once.
      const count = await redis.incr(windowKey)
      if (count === 1) await redis.pexpire(windowKey, WINDOW_MS)
      const ttl = await redis.pttl(windowKey)
      const resetInMs = ttl > 0 ? ttl : WINDOW_MS
      if (count > RATE_LIMIT) return { ok: false, remaining: 0, resetInMs }
      return { ok: true, remaining: Math.max(0, RATE_LIMIT - count), resetInMs }
    } catch {
      // fall through to in-memory — Redis hiccup shouldn't lock out API.
    }
  }
  return rateLimitInMemory(key)
}

function rateLimitInMemory(key: string): RateResult {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true, remaining: RATE_LIMIT - 1, resetInMs: WINDOW_MS }
  }
  if (b.count >= RATE_LIMIT) {
    return { ok: false, remaining: 0, resetInMs: b.resetAt - now }
  }
  b.count += 1
  return { ok: true, remaining: RATE_LIMIT - b.count, resetInMs: b.resetAt - now }
}
