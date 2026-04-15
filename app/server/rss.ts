import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import { enqueueRssPoll } from './rss/schedule'

export type RssFeedRow = {
  id: string
  url: string
  title: string | null
  lastPolledAt: string | null
  autoPublish: boolean
  defaultAccountIds: string[]
  contentTemplate: string
  active: boolean
  createdAt: string
  itemCount: number
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

const wsInput = z.object({ workspaceSlug: z.string().min(1) })

export const listRssFeeds = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsInput.parse(d))
  .handler(async ({ data }): Promise<RssFeedRow[]> => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const rows = await db
      .select({
        id: schema.rssFeeds.id,
        url: schema.rssFeeds.url,
        title: schema.rssFeeds.title,
        lastPolledAt: schema.rssFeeds.lastPolledAt,
        autoPublish: schema.rssFeeds.autoPublish,
        defaultAccountIds: schema.rssFeeds.defaultAccountIds,
        contentTemplate: schema.rssFeeds.contentTemplate,
        active: schema.rssFeeds.active,
        createdAt: schema.rssFeeds.createdAt,
      })
      .from(schema.rssFeeds)
      .where(eq(schema.rssFeeds.workspaceId, workspace.id))
      .orderBy(desc(schema.rssFeeds.createdAt))

    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      lastPolledAt: r.lastPolledAt?.toISOString() ?? null,
      autoPublish: r.autoPublish,
      defaultAccountIds: r.defaultAccountIds,
      contentTemplate: r.contentTemplate,
      active: r.active,
      createdAt: r.createdAt.toISOString(),
      itemCount: 0,
    }))
  })

const addInput = z.object({
  workspaceSlug: z.string().min(1),
  url: z.string().url(),
  contentTemplate: z.string().default('{{title}}\n\n{{link}}'),
  autoPublish: z.boolean().default(false),
  defaultAccountIds: z.array(z.string().uuid()).default([]),
})

export const addRssFeed = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => addInput.parse(d))
  .handler(async ({ data }) => {
    const r = await ensureWs(data.workspaceSlug)
    const [row] = await db
      .insert(schema.rssFeeds)
      .values({
        workspaceId: r.workspace.id,
        createdById: r.user.id,
        url: data.url,
        contentTemplate: data.contentTemplate,
        autoPublish: data.autoPublish,
        defaultAccountIds: data.defaultAccountIds,
      })
      .returning({ id: schema.rssFeeds.id })
    if (!row) throw new Error('Failed to create feed')
    return { id: row.id }
  })

const updateInput = z.object({
  workspaceSlug: z.string().min(1),
  id: z.string().uuid(),
  active: z.boolean().optional(),
  autoPublish: z.boolean().optional(),
  defaultAccountIds: z.array(z.string().uuid()).optional(),
  contentTemplate: z.string().optional(),
})

export const updateRssFeed = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => updateInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const patch: Record<string, unknown> = {}
    if (data.active !== undefined) patch.active = data.active
    if (data.autoPublish !== undefined) patch.autoPublish = data.autoPublish
    if (data.defaultAccountIds !== undefined) patch.defaultAccountIds = data.defaultAccountIds
    if (data.contentTemplate !== undefined) patch.contentTemplate = data.contentTemplate
    await db
      .update(schema.rssFeeds)
      .set(patch)
      .where(
        and(eq(schema.rssFeeds.id, data.id), eq(schema.rssFeeds.workspaceId, workspace.id)),
      )
    return { ok: true as const }
  })

const removeInput = z.object({
  workspaceSlug: z.string().min(1),
  id: z.string().uuid(),
})

export const removeRssFeed = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => removeInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    await db
      .delete(schema.rssFeeds)
      .where(
        and(eq(schema.rssFeeds.id, data.id), eq(schema.rssFeeds.workspaceId, workspace.id)),
      )
    return { ok: true as const }
  })

export const pollRssFeedNow = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => removeInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const feed = await db.query.rssFeeds.findFirst({
      where: and(eq(schema.rssFeeds.id, data.id), eq(schema.rssFeeds.workspaceId, workspace.id)),
    })
    if (!feed) throw new Error('Feed not found')
    await enqueueRssPoll(feed.id)
    return { ok: true as const }
  })
