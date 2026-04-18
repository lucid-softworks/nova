import { AsyncLocalStorage } from 'node:async_hooks'
import { getRequest } from '@tanstack/react-start/server'
import { and, eq } from 'drizzle-orm'
import { auth } from '~/lib/auth'
import { db, schema } from './db'
import type { SessionContext, WorkspaceRole } from './types'
import { bootQueues } from './queues/bootstrap'

const overrideStorage = new AsyncLocalStorage<SessionContext>()

/**
 * Run `fn` with a pre-resolved session context, bypassing the normal
 * cookie-based lookup. Used by API v1 routes that authenticate via Bearer
 * tokens so existing `requireWorkspaceAccess`-based impls just work.
 */
export function withSessionOverride<T>(ctx: SessionContext, fn: () => Promise<T>): Promise<T> {
  return overrideStorage.run(ctx, fn)
}

async function loadPlatformSurface() {
  const row = await db.query.platformSettings.findFirst({
    where: eq(schema.platformSettings.id, 'singleton'),
  })
  return {
    maintenanceMode: row?.maintenanceMode ?? false,
    announcementBanner: row?.announcementBanner ?? null,
    featureFlags: row?.featureFlags ?? {},
  }
}

/**
 * Call from mutation server functions to refuse the write when the
 * platform is in maintenance mode. Admins bypass so they can still
 * flip the toggle back off and fix things.
 */
export async function assertNotInMaintenance(): Promise<void> {
  const ctx = await loadSessionContext()
  if (!ctx.platform.maintenanceMode) return
  if (ctx.user) {
    const row = await db.query.user.findFirst({ where: eq(schema.user.id, ctx.user.id) })
    if (row?.role === 'admin') return
  }
  throw new Error('Nova is in maintenance mode. Please try again shortly.')
}

/**
 * Call from server functions that implement a feature gated by a platform
 * feature flag. Throws if the flag is explicitly false. Missing/true
 * is treated as enabled so flipping a flag on isn't required.
 */
export async function assertFeatureEnabled(key: string): Promise<void> {
  const ctx = await loadSessionContext()
  if (ctx.platform.featureFlags[key] === false) {
    throw new Error(`The ${key} feature is currently disabled.`)
  }
}

export async function loadSessionContext(): Promise<SessionContext> {
  bootQueues()
  const override = overrideStorage.getStore()
  if (override) return override
  const session = await auth.api.getSession({ headers: getRequest().headers })
  const platform = await loadPlatformSurface()
  if (!session?.user) {
    return { user: null, workspaces: [], activeOrganizationId: null, platform, impersonatedBy: null }
  }
  const impersonatedBy =
    (session.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy ?? null

  const rows = await db
    .select({
      id: schema.workspaces.id,
      organizationId: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      logoUrl: schema.organization.logo,
      appName: schema.workspaces.appName,
      role: schema.member.role,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.organizationId, schema.organization.id),
    )
    .where(eq(schema.member.userId, session.user.id))

  const role = (session.user as { role?: string | null }).role ?? null

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
      role,
    },
    workspaces: rows.map((r) => ({ ...r, role: r.role as WorkspaceRole })),
    activeOrganizationId:
      (session.session as { activeOrganizationId?: string | null } | undefined)
        ?.activeOrganizationId ?? null,
    platform,
    impersonatedBy,
  }
}

/**
 * Pin Better Auth's `activeOrganizationId` to the org backing the given
 * workspace slug. Idempotent — no-op when already active or caller is not
 * a member. Swallows errors so navigation never breaks on a pinning failure.
 */
export async function setActiveWorkspaceImpl(slug: string): Promise<void> {
  try {
    await auth.api.setActiveOrganization({
      headers: getRequest().headers,
      body: { organizationSlug: slug },
    })
  } catch {
    // Non-fatal: the session just keeps its previous active org.
  }
}

export async function requireWorkspaceAccess(slug: string) {
  const ctx = await loadSessionContext()
  if (!ctx.user) return { ok: false as const, reason: 'unauthenticated' as const }
  const ws = ctx.workspaces.find((w) => w.slug === slug)
  if (!ws) return { ok: false as const, reason: 'forbidden' as const }
  return { ok: true as const, user: ctx.user, workspace: ws, workspaces: ctx.workspaces }
}

/**
 * Extended fetch used by settings/team: returns the join rows needed to
 * edit organization identity (name/slug/logo) and the satellite
 * workspaces row. Pulls the caller's member role too so role checks
 * don't need a second query.
 */
export async function requireWorkspaceDetail(slug: string) {
  const ctx = await loadSessionContext()
  if (!ctx.user) return { ok: false as const, reason: 'unauthenticated' as const }
  const row = await db
    .select({
      organizationId: schema.organization.id,
      workspaceId: schema.workspaces.id,
      orgName: schema.organization.name,
      orgSlug: schema.organization.slug,
      orgLogo: schema.organization.logo,
      appName: schema.workspaces.appName,
      timezone: schema.workspaces.timezone,
      defaultLanguage: schema.workspaces.defaultLanguage,
      requireApproval: schema.workspaces.requireApproval,
      role: schema.member.role,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.organizationId, schema.organization.id),
    )
    .where(
      and(eq(schema.member.userId, ctx.user.id), eq(schema.organization.slug, slug)),
    )
    .limit(1)

  const hit = row[0]
  if (!hit) return { ok: false as const, reason: 'forbidden' as const }
  return {
    ok: true as const,
    user: ctx.user,
    detail: { ...hit, role: hit.role as WorkspaceRole },
  }
}
