import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from './db'
import { loadSessionContext } from './session.server'

export type NotificationType =
  | 'post_published'
  | 'post_failed'
  | 'approval_requested'
  | 'post_approved'
  | 'post_rejected'
  | 'member_joined'
  | 'campaign_on_hold'

export type NotificationData = Record<string, string | number | boolean | null>

export type NotificationRow = {
  id: string
  type: NotificationType
  title: string
  body: string
  data: NotificationData
  readAt: string | null
  createdAt: string
  workspaceSlug: string | null
}

async function requireUser() {
  const ctx = await loadSessionContext()
  if (!ctx.user) throw new Error('unauthenticated')
  const user = ctx.user
  return { ...ctx, user }
}

export async function listMyNotificationsImpl(): Promise<NotificationRow[]> {
  const { user } = await requireUser()
  const rows = await db
    .select({
      id: schema.notifications.id,
      type: schema.notifications.type,
      title: schema.notifications.title,
      body: schema.notifications.body,
      data: schema.notifications.data,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
      slug: schema.workspaces.slug,
    })
    .from(schema.notifications)
    .leftJoin(schema.workspaces, eq(schema.workspaces.id, schema.notifications.workspaceId))
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50)

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    data: (r.data ?? {}) as NotificationData,
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    workspaceSlug: r.slug,
  }))
}

export async function unreadCountImpl(): Promise<number> {
  const { user } = await requireUser()
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(
      and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)),
    )
  return rows[0]?.n ?? 0
}

export async function markReadImpl(ids: string[]) {
  if (ids.length === 0) return { ok: true }
  const { user } = await requireUser()
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, user.id),
        inArray(schema.notifications.id, ids),
      ),
    )
  return { ok: true }
}

export async function markAllReadImpl() {
  const { user } = await requireUser()
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)),
    )
  return { ok: true }
}

// -- Emission helpers (callable from other server code) -------------------

export async function notifyUser(params: {
  userId: string
  workspaceId: string
  type: NotificationType
  title: string
  body: string
  data?: NotificationData
}) {
  await db.insert(schema.notifications).values({
    userId: params.userId,
    workspaceId: params.workspaceId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data ?? {},
  })
}

export async function notifyWorkspaceAdmins(params: {
  workspaceId: string
  type: NotificationType
  title: string
  body: string
  data?: NotificationData
}) {
  const members = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, params.workspaceId),
        eq(schema.workspaceMembers.role, 'admin'),
      ),
    )
  for (const m of members) {
    await notifyUser({ ...params, userId: m.userId })
  }
}

export async function notifyWorkspaceApprovers(params: {
  workspaceId: string
  type: NotificationType
  title: string
  body: string
  data?: NotificationData
}) {
  const approvers = await db
    .select({ userId: schema.workspaceApprovers.userId })
    .from(schema.workspaceApprovers)
    .where(eq(schema.workspaceApprovers.workspaceId, params.workspaceId))
  for (const a of approvers) {
    await notifyUser({ ...params, userId: a.userId })
  }
}
