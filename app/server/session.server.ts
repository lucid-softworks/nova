import { AsyncLocalStorage } from 'node:async_hooks'
import { getRequest } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { auth } from '~/lib/auth'
import { db, schema } from './db'
import type { SessionContext } from './types'
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
      name: schema.workspaces.name,
      slug: schema.workspaces.slug,
      logoUrl: schema.workspaces.logoUrl,
      appName: schema.workspaces.appName,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.userId, session.user.id))

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
    },
    workspaces: rows,
  }
}

export async function requireWorkspaceAccess(slug: string) {
  const ctx = await loadSessionContext()
  if (!ctx.user) return { ok: false as const, reason: 'unauthenticated' as const }
  const ws = ctx.workspaces.find((w) => w.slug === slug)
  if (!ws) return { ok: false as const, reason: 'forbidden' as const }
  return { ok: true as const, user: ctx.user, workspace: ws, workspaces: ctx.workspaces }
}
