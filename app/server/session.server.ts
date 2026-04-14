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

export async function loadSessionContext(): Promise<SessionContext> {
  bootQueues()
  const override = overrideStorage.getStore()
  if (override) return override
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session?.user) return { user: null, workspaces: [] }

  const rows = await db
    .select({
      id: schema.workspaces.id,
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

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
    },
    workspaces: rows.map((r) => ({ ...r, role: r.role as WorkspaceRole })),
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
