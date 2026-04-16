import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'

export type SavedReplyRow = {
  id: string
  title: string
  content: string
  shortcut: string | null
  createdAt: string
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

const wsInput = z.object({ workspaceSlug: z.string().min(1) })

export const listSavedReplies = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsInput.parse(d))
  .handler(async ({ data }): Promise<SavedReplyRow[]> => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const rows = await db
      .select({
        id: schema.savedReplies.id,
        title: schema.savedReplies.title,
        content: schema.savedReplies.content,
        shortcut: schema.savedReplies.shortcut,
        createdAt: schema.savedReplies.createdAt,
      })
      .from(schema.savedReplies)
      .where(eq(schema.savedReplies.workspaceId, workspace.id))
      .orderBy(desc(schema.savedReplies.createdAt))
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }))
  })

const createInput = z.object({
  workspaceSlug: z.string().min(1),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  shortcut: z.string().max(50).nullable().default(null),
})

export const createSavedReply = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace, user } = await ensureWs(data.workspaceSlug)
    const [row] = await db
      .insert(schema.savedReplies)
      .values({
        workspaceId: workspace.id,
        title: data.title,
        content: data.content,
        shortcut: data.shortcut,
        createdById: user.id,
      })
      .returning({ id: schema.savedReplies.id })
    return { id: row!.id }
  })

const updateInput = z.object({
  workspaceSlug: z.string().min(1),
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(5000).optional(),
  shortcut: z.string().max(50).nullable().optional(),
})

export const updateSavedReply = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => updateInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const patch: Record<string, unknown> = {}
    if (data.title !== undefined) patch.title = data.title
    if (data.content !== undefined) patch.content = data.content
    if (data.shortcut !== undefined) patch.shortcut = data.shortcut
    await db
      .update(schema.savedReplies)
      .set(patch)
      .where(
        and(
          eq(schema.savedReplies.id, data.id),
          eq(schema.savedReplies.workspaceId, workspace.id),
        ),
      )
    return { ok: true as const }
  })

const deleteInput = z.object({
  workspaceSlug: z.string().min(1),
  id: z.string().uuid(),
})

export const deleteSavedReply = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    await db
      .delete(schema.savedReplies)
      .where(
        and(
          eq(schema.savedReplies.id, data.id),
          eq(schema.savedReplies.workspaceId, workspace.id),
        ),
      )
    return { ok: true as const }
  })
