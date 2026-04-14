import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
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

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Authenticate an API v1 request via either:
 *  - Authorization: Bearer sk_... → looks up api_keys by SHA-256 hash, resolves
 *    the owning workspace and the caller's membership (required)
 *  - Better Auth session cookie + ?workspaceSlug=... / X-Workspace-Slug header
 *
 * Returns the resolved workspace + user context, or a structured failure.
 */
export async function authenticateApiRequest(
  request: Request,
  explicitSlug?: string | null,
): Promise<ApiAuthResult> {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim()
    if (!token) return { ok: false, err: { kind: 'invalid_key' } }
    const hash = sha256(token)

    const row = await db.query.apiKeys.findFirst({
      where: eq(schema.apiKeys.keyHash, hash),
    })
    if (!row) return { ok: false, err: { kind: 'invalid_key' } }

    const ws = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, row.workspaceId),
    })
    if (!ws) return { ok: false, err: { kind: 'forbidden', reason: 'workspace_not_found' } }

    // Touch lastUsedAt; fire-and-forget (don't block the request).
    db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, row.id))
      .catch(() => {})

    return {
      ok: true,
      ctx: {
        userId: ws.ownerId,
        workspaceId: ws.id,
        workspaceSlug: ws.slug,
        role: 'admin',
        viaApiKey: true,
      },
    }
  }

  // Session-cookie path.
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null)
  if (!session?.user) return { ok: false, err: { kind: 'unauthenticated' } }

  const url = new URL(request.url)
  const slug =
    explicitSlug ??
    url.searchParams.get('workspaceSlug') ??
    request.headers.get('x-workspace-slug')
  if (!slug) return { ok: false, err: { kind: 'forbidden', reason: 'workspace_not_found' } }

  const ws = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.slug, slug),
  })
  if (!ws) return { ok: false, err: { kind: 'forbidden', reason: 'workspace_not_found' } }

  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(schema.workspaceMembers.workspaceId, ws.id),
      eq(schema.workspaceMembers.userId, session.user.id),
    ),
  })
  if (!membership) return { ok: false, err: { kind: 'forbidden', reason: 'no_access' } }

  return {
    ok: true,
    ctx: {
      userId: session.user.id,
      workspaceId: ws.id,
      workspaceSlug: ws.slug,
      role: membership.role,
      viaApiKey: false,
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

// In-memory token-bucket rate limiter keyed by a caller identifier.
// 100 requests per rolling minute. Upstash/Redis is the plan, this keeps
// the door closed until that lands.
const buckets = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 100
const WINDOW_MS = 60_000

export function rateLimit(key: string): { ok: boolean; remaining: number; resetInMs: number } {
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
