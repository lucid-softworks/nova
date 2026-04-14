import { and, eq, isNull, lte } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { getPostQueue } from './postQueue'

let running = false

export async function tickScheduler() {
  if (running) return
  running = true
  try {
    const now = new Date()
    const due = await db
      .select({ id: schema.posts.id, workspaceId: schema.posts.workspaceId })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.status, 'scheduled'),
          lte(schema.posts.scheduledAt, now),
          isNull(schema.posts.campaignId),
        ),
      )

    if (due.length > 0) {
      const queue = getPostQueue()
      for (const p of due) {
        await queue.add(
          'publish',
          { postId: p.id, workspaceId: p.workspaceId },
          { jobId: `post-${p.id}` },
        )
        await db
          .update(schema.posts)
          .set({ status: 'publishing' })
          .where(eq(schema.posts.id, p.id))
      }
      console.log(`[scheduler] enqueued ${due.length} post(s)`)
    }

    // Campaign step readiness — enqueue any ready steps whose scheduled time has passed
    const readySteps = await db
      .select({
        id: schema.campaignSteps.id,
        postId: schema.campaignSteps.postId,
        workspaceId: schema.campaigns.workspaceId,
      })
      .from(schema.campaignSteps)
      .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignSteps.campaignId))
      .where(
        and(
          eq(schema.campaignSteps.status, 'ready'),
          lte(schema.campaignSteps.triggerScheduledAt, now),
        ),
      )
    if (readySteps.length > 0) {
      const queue = getPostQueue()
      for (const s of readySteps) {
        if (!s.postId) continue
        await queue.add(
          'publish',
          { postId: s.postId, workspaceId: s.workspaceId },
          { jobId: `post-${s.postId}` },
        )
        await db
          .update(schema.campaignSteps)
          .set({ status: 'publishing' })
          .where(eq(schema.campaignSteps.id, s.id))
      }
    }
  } finally {
    running = false
  }
}

let interval: ReturnType<typeof setInterval> | null = null

export function startScheduler() {
  if (interval) return
  interval = setInterval(() => {
    tickScheduler().catch((e) => console.error('[scheduler] tick error', e))
  }, 60_000)
  // Run once immediately on boot so scheduled posts in the past get picked up quickly.
  setTimeout(() => tickScheduler().catch(() => {}), 2_000)
}
