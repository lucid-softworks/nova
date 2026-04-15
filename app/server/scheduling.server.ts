import { and, asc, eq, gte } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import { notifyUser, notifyWorkspaceApprovers } from './notifications.server'
import { publishWebhookEvent } from './webhooks.server'
import { assertWithinLimit } from '~/lib/billing/limits'

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

async function ensurePostInWorkspace(workspaceId: string, postId: string) {
  const post = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.workspaceId, workspaceId)),
  })
  if (!post) throw new Error('Post not found')
  return post
}

export async function scheduleAtImpl(slug: string, postId: string, scheduledAt: Date) {
  const { workspace, user } = await ensureWs(slug)
  const existing = await ensurePostInWorkspace(workspace.id, postId)
  if (scheduledAt.getTime() < Date.now() - 60_000) {
    throw new Error('Scheduled time is in the past')
  }
  // Only count against quota on the first schedule — moving an already-
  // scheduled post shouldn't re-consume budget.
  if (existing.status !== 'scheduled' && existing.status !== 'published') {
    await assertWithinLimit(workspace.id, 'post')
  }
  await db
    .update(schema.posts)
    .set({ status: 'scheduled', scheduledAt, isQueue: false, failedAt: null, failureReason: null })
    .where(eq(schema.posts.id, postId))
  await db
    .insert(schema.postActivity)
    .values({ postId, userId: user.id, action: 'scheduled' })
  await publishWebhookEvent(workspace.id, 'post.scheduled', {
    postId,
    workspaceId: workspace.id,
    scheduledAt: scheduledAt.toISOString(),
  })
  return { postId, scheduledAt: scheduledAt.toISOString() }
}

export async function publishNowImpl(slug: string, postId: string) {
  return scheduleAtImpl(slug, postId, new Date(Date.now() + 5_000))
}

export async function submitForApprovalImpl(slug: string, postId: string) {
  const { workspace, user } = await ensureWs(slug)
  await ensurePostInWorkspace(workspace.id, postId)
  await db
    .update(schema.posts)
    .set({ status: 'pending_approval', failedAt: null, failureReason: null })
    .where(eq(schema.posts.id, postId))
  await db
    .insert(schema.postActivity)
    .values({ postId, userId: user.id, action: 'edited', note: 'submitted for approval' })
  await notifyWorkspaceApprovers({
    workspaceId: workspace.id,
    type: 'approval_requested',
    title: 'A post needs your approval',
    body: `${user.name} submitted a post for approval.`,
    data: { postId },
  })
  return { postId }
}

export async function approvePostImpl(slug: string, postId: string, scheduledAtIso: string | null) {
  const { workspace, user } = await ensureWs(slug)
  if (workspace.role !== 'admin' && workspace.role !== 'manager') {
    throw new Error('Insufficient permission')
  }
  const post = await ensurePostInWorkspace(workspace.id, postId)
  const when = scheduledAtIso ? new Date(scheduledAtIso) : new Date(Date.now() + 5_000)
  await db
    .update(schema.posts)
    .set({ status: 'scheduled', scheduledAt: when, failedAt: null, failureReason: null })
    .where(eq(schema.posts.id, postId))
  await db
    .insert(schema.postActivity)
    .values({ postId, userId: user.id, action: 'approved' })
  if (post.authorId) {
    await notifyUser({
      userId: post.authorId,
      workspaceId: workspace.id,
      type: 'post_approved',
      title: 'Your post was approved',
      body: `${user.name} approved your post.`,
      data: { postId },
    })
  }
  await publishWebhookEvent(workspace.id, 'post.approved', {
    postId,
    workspaceId: workspace.id,
    scheduledAt: when.toISOString(),
    approvedBy: user.id,
  })
  return { postId, scheduledAt: when.toISOString() }
}

export async function requestChangesImpl(slug: string, postId: string, note: string) {
  const { workspace, user } = await ensureWs(slug)
  if (workspace.role !== 'admin' && workspace.role !== 'manager') {
    throw new Error('Insufficient permission')
  }
  const post = await ensurePostInWorkspace(workspace.id, postId)
  await db
    .update(schema.posts)
    .set({ status: 'draft' })
    .where(eq(schema.posts.id, postId))
  await db
    .insert(schema.postActivity)
    .values({ postId, userId: user.id, action: 'rejected', note })
  if (post.authorId) {
    await notifyUser({
      userId: post.authorId,
      workspaceId: workspace.id,
      type: 'post_rejected',
      title: 'Changes requested on your post',
      body: note || `${user.name} requested changes.`,
      data: { postId },
    })
  }
  await publishWebhookEvent(workspace.id, 'post.rejected', {
    postId,
    workspaceId: workspace.id,
    note,
    rejectedBy: user.id,
  })
  return { ok: true }
}

export type QueueResult =
  | { ok: true; postId: string; scheduledAt: string }
  | { ok: false; reason: 'no_schedule' }

export async function addToQueueImpl(slug: string, postId: string): Promise<QueueResult> {
  const { workspace, user } = await ensureWs(slug)
  await ensurePostInWorkspace(workspace.id, postId)

  const schedules = await db
    .select()
    .from(schema.postingSchedules)
    .where(eq(schema.postingSchedules.workspaceId, workspace.id))

  if (schedules.length === 0 || schedules.every((s) => s.times.length === 0)) {
    return { ok: false, reason: 'no_schedule' }
  }

  const now = new Date()
  const queuedPosts = await db
    .select({ id: schema.posts.id, scheduledAt: schema.posts.scheduledAt })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.workspaceId, workspace.id),
        eq(schema.posts.isQueue, true),
        eq(schema.posts.status, 'scheduled'),
        gte(schema.posts.scheduledAt, now),
      ),
    )
    .orderBy(asc(schema.posts.scheduledAt))

  const takenSlots = new Set(
    queuedPosts.map((p) => p.scheduledAt?.toISOString()).filter(Boolean) as string[],
  )

  // Walk forward from now through 14 days of slots (upper bound) finding first free slot
  const slot = findNextFreeSlot(now, schedules, takenSlots)
  if (!slot) return { ok: false, reason: 'no_schedule' }

  await db
    .update(schema.posts)
    .set({
      status: 'scheduled',
      scheduledAt: slot,
      isQueue: true,
      failedAt: null,
      failureReason: null,
    })
    .where(eq(schema.posts.id, postId))
  await db
    .insert(schema.postActivity)
    .values({ postId, userId: user.id, action: 'scheduled', note: 'queued' })

  return { ok: true, postId, scheduledAt: slot.toISOString() }
}

function findNextFreeSlot(
  from: Date,
  schedules: { dayOfWeek: number; times: string[] }[],
  taken: Set<string>,
): Date | null {
  const byDow = new Map<number, string[]>()
  for (const s of schedules) {
    byDow.set(s.dayOfWeek, [...(byDow.get(s.dayOfWeek) ?? []), ...s.times].sort())
  }
  for (let i = 0; i < 14 * 24; i++) {
    // iterate day by day, hour by hour, but we actually want day-by-day + all times for that day
    const step = Math.floor(i / 24)
    if (i % 24 !== 0) continue
    const day = new Date(from)
    day.setDate(day.getDate() + step)
    const dow = day.getDay()
    const times = byDow.get(dow)
    if (!times) continue
    for (const t of times) {
      const parts = t.split(':')
      const hh = Number(parts[0] ?? 0)
      const mm = Number(parts[1] ?? 0)
      const slot = new Date(day)
      slot.setHours(hh, mm, 0, 0)
      if (slot.getTime() <= from.getTime()) continue
      if (taken.has(slot.toISOString())) continue
      return slot
    }
  }
  return null
}
