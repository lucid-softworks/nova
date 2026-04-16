import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import { nextCronFire } from '~/lib/cron'

export type RecurringRow = {
  id: string
  sourcePostId: string
  cronExpression: string
  timezone: string
  socialAccountIds: string[]
  active: boolean
  lastFiredAt: string | null
  nextFireAt: string | null
  createdAt: string
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

const wsInput = z.object({ workspaceSlug: z.string().min(1) })

export const listRecurring = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsInput.parse(d))
  .handler(async ({ data }): Promise<RecurringRow[]> => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const rows = await db
      .select()
      .from(schema.recurringPosts)
      .where(eq(schema.recurringPosts.workspaceId, workspace.id))
      .orderBy(desc(schema.recurringPosts.createdAt))
    return rows.map((r) => ({
      id: r.id,
      sourcePostId: r.sourcePostId,
      cronExpression: r.cronExpression,
      timezone: r.timezone,
      socialAccountIds: r.socialAccountIds,
      active: r.active,
      lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
      nextFireAt: r.nextFireAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  })

const createInput = z.object({
  workspaceSlug: z.string().min(1),
  sourcePostId: z.string().uuid(),
  cronExpression: z.string().min(1),
  timezone: z.string().default('UTC'),
  socialAccountIds: z.array(z.string().uuid()).min(1),
})

export const createRecurring = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace, user } = await ensureWs(data.workspaceSlug)
    const post = await db.query.posts.findFirst({
      where: and(
        eq(schema.posts.id, data.sourcePostId),
        eq(schema.posts.workspaceId, workspace.id),
      ),
    })
    if (!post) throw new Error('Source post not found')
    const next = nextCronFire(data.cronExpression)
    const [row] = await db
      .insert(schema.recurringPosts)
      .values({
        workspaceId: workspace.id,
        sourcePostId: data.sourcePostId,
        cronExpression: data.cronExpression,
        timezone: data.timezone,
        socialAccountIds: data.socialAccountIds,
        nextFireAt: next,
        createdById: user.id,
      })
      .returning({ id: schema.recurringPosts.id })
    return { id: row!.id }
  })

const updateInput = z.object({
  workspaceSlug: z.string().min(1),
  id: z.string().uuid(),
  active: z.boolean().optional(),
  cronExpression: z.string().min(1).optional(),
  socialAccountIds: z.array(z.string().uuid()).optional(),
})

export const updateRecurring = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => updateInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const patch: Record<string, unknown> = {}
    if (data.active !== undefined) patch.active = data.active
    if (data.socialAccountIds !== undefined) patch.socialAccountIds = data.socialAccountIds
    if (data.cronExpression) {
      patch.cronExpression = data.cronExpression
      patch.nextFireAt = nextCronFire(data.cronExpression)
    }
    await db
      .update(schema.recurringPosts)
      .set(patch)
      .where(
        and(
          eq(schema.recurringPosts.id, data.id),
          eq(schema.recurringPosts.workspaceId, workspace.id),
        ),
      )
    return { ok: true as const }
  })

const deleteInput = z.object({
  workspaceSlug: z.string().min(1),
  id: z.string().uuid(),
})

export const deleteRecurring = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    await db
      .delete(schema.recurringPosts)
      .where(
        and(
          eq(schema.recurringPosts.id, data.id),
          eq(schema.recurringPosts.workspaceId, workspace.id),
        ),
      )
    return { ok: true as const }
  })
