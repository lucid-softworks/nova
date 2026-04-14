import { getRequest } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { auth } from '~/lib/auth'
import { db, schema } from './db'

export type SessionUser = {
  id: string
  email: string
  name: string
  image: string | null
}

export type WorkspaceSummary = {
  id: string
  name: string
  slug: string
  role: (typeof schema.workspaceRoleEnum.enumValues)[number]
  logoUrl: string | null
  appName: string | null
}

export type SessionContext = {
  user: SessionUser | null
  workspaces: WorkspaceSummary[]
}

export async function loadSessionContext(): Promise<SessionContext> {
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
