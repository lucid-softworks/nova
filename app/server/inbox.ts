import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'

export type InboxRow = {
  id: string
  platform: string
  kind: string
  actorHandle: string | null
  actorName: string | null
  actorAvatar: string | null
  content: string | null
  permalink: string | null
  itemCreatedAt: string
  readAt: string | null
  socialAccountId: string
  postPlatformId: string | null
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

const listInput = z.object({
  workspaceSlug: z.string().min(1),
  kind: z.enum(['all', 'mention', 'reply', 'like', 'repost', 'follow']).default('all'),
  unread: z.boolean().optional(),
})

export const listInbox = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data }): Promise<InboxRow[]> => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const where = [eq(schema.inboxItems.workspaceId, workspace.id)]
    if (data.kind === 'mention' || data.kind === 'reply') {
      where.push(inArray(schema.inboxItems.kind, [data.kind, data.kind === 'mention' ? 'reply' : 'mention']))
      // actually scope strictly to the requested kind
      where.pop()
      where.push(eq(schema.inboxItems.kind, data.kind))
    } else if (data.kind !== 'all') {
      where.push(eq(schema.inboxItems.kind, data.kind))
    }
    if (data.unread) where.push(isNull(schema.inboxItems.readAt))

    const rows = await db
      .select({
        id: schema.inboxItems.id,
        platform: schema.inboxItems.platform,
        kind: schema.inboxItems.kind,
        actorHandle: schema.inboxItems.actorHandle,
        actorName: schema.inboxItems.actorName,
        actorAvatar: schema.inboxItems.actorAvatar,
        content: schema.inboxItems.content,
        permalink: schema.inboxItems.permalink,
        itemCreatedAt: schema.inboxItems.itemCreatedAt,
        readAt: schema.inboxItems.readAt,
        socialAccountId: schema.inboxItems.socialAccountId,
        postPlatformId: schema.inboxItems.postPlatformId,
      })
      .from(schema.inboxItems)
      .where(and(...where))
      .orderBy(desc(schema.inboxItems.itemCreatedAt))
      .limit(200)

    return rows.map((r) => ({
      ...r,
      itemCreatedAt: r.itemCreatedAt.toISOString(),
      readAt: r.readAt?.toISOString() ?? null,
    }))
  })

const markInput = z.object({
  workspaceSlug: z.string().min(1),
  ids: z.array(z.string().uuid()),
  read: z.boolean(),
})

export const markInboxRead = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => markInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    await db
      .update(schema.inboxItems)
      .set({ readAt: data.read ? new Date() : null })
      .where(
        and(
          eq(schema.inboxItems.workspaceId, workspace.id),
          inArray(schema.inboxItems.id, data.ids),
        ),
      )
    return { ok: true as const }
  })

export const inboxUnreadCount = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) =>
    z.object({ workspaceSlug: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const rows = await db
      .select({ id: schema.inboxItems.id })
      .from(schema.inboxItems)
      .where(
        and(
          eq(schema.inboxItems.workspaceId, workspace.id),
          isNull(schema.inboxItems.readAt),
        ),
      )
    return { unread: rows.length }
  })

export const pollInboxNow = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) =>
    z.object({ workspaceSlug: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const { getInboxQueue } = await import('./inbox/schedule')
    await getInboxQueue().add('inbox:manual', {} as never)
    return { ok: true as const, workspaceId: workspace.id }
  })

// Keep the isNotNull symbol warm for future typing without a lint warning.
void isNotNull
