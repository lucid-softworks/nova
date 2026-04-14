import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { getPostQueue } from './postQueue'
import { publishWebhookEvent } from '~/server/webhooks.server'

export async function onStepComplete(stepId: string, success: boolean) {
  const step = await db.query.campaignSteps.findFirst({
    where: eq(schema.campaignSteps.id, stepId),
  })
  if (!step) return

  await db
    .update(schema.campaignSteps)
    .set({ status: success ? 'published' : 'failed' })
    .where(eq(schema.campaignSteps.id, stepId))

  if (!success) {
    await holdDependents(step.campaignId, stepId)
    await emitCampaignOnHold(step.campaignId)
  } else {
    await scheduleDependents(step.campaignId, stepId)
  }

  await recomputeCampaignStatus(step.campaignId)
}

async function holdDependents(campaignId: string, stepId: string) {
  // Recursively mark all descendants on_hold
  const all = await db
    .select()
    .from(schema.campaignSteps)
    .where(eq(schema.campaignSteps.campaignId, campaignId))
  const descendants = new Set<string>()
  const add = (id: string) => {
    for (const s of all) {
      if (s.dependsOnStepId === id && !descendants.has(s.id)) {
        descendants.add(s.id)
        add(s.id)
      }
    }
  }
  add(stepId)
  if (descendants.size === 0) return
  await db
    .update(schema.campaignSteps)
    .set({ status: 'on_hold' })
    .where(inArray(schema.campaignSteps.id, [...descendants]))

  // Mark posts as pending_approval or leave — per plan this doesn't specify,
  // but the campaign is on_hold so posts should not auto-publish. Flip their
  // status to draft so the scheduler won't pick them up.
  const posts = await db
    .select({ postId: schema.campaignSteps.postId })
    .from(schema.campaignSteps)
    .where(inArray(schema.campaignSteps.id, [...descendants]))
  const postIds = posts.map((p) => p.postId).filter(Boolean) as string[]
  if (postIds.length > 0) {
    await db
      .update(schema.posts)
      .set({ status: 'draft', scheduledAt: null })
      .where(inArray(schema.posts.id, postIds))
  }
}

async function scheduleDependents(campaignId: string, completedStepId: string) {
  const dependents = await db
    .select()
    .from(schema.campaignSteps)
    .where(
      and(
        eq(schema.campaignSteps.campaignId, campaignId),
        eq(schema.campaignSteps.dependsOnStepId, completedStepId),
        eq(schema.campaignSteps.status, 'waiting'),
      ),
    )
  if (dependents.length === 0) return

  const queue = getPostQueue()
  const now = Date.now()

  for (const dep of dependents) {
    if (!dep.postId) continue
    if (dep.triggerType === 'immediate') {
      await queue.add(
        'publish',
        { postId: dep.postId, workspaceId: await workspaceForPost(dep.postId) },
        { jobId: `post-${dep.postId}-${Date.now()}` },
      )
      await db
        .update(schema.campaignSteps)
        .set({ status: 'publishing' })
        .where(eq(schema.campaignSteps.id, dep.id))
      await db
        .update(schema.posts)
        .set({ status: 'publishing' })
        .where(eq(schema.posts.id, dep.postId))
    } else if (dep.triggerType === 'delay') {
      const delayMs = Math.max(0, (dep.triggerDelayMinutes ?? 0) * 60_000)
      const fireAt = new Date(now + delayMs)
      await db
        .update(schema.campaignSteps)
        .set({ status: 'ready', triggerScheduledAt: fireAt })
        .where(eq(schema.campaignSteps.id, dep.id))
      await db
        .update(schema.posts)
        .set({ status: 'scheduled', scheduledAt: fireAt })
        .where(eq(schema.posts.id, dep.postId))
    } else if (dep.triggerType === 'scheduled') {
      const when = dep.triggerScheduledAt
      if (!when) {
        // Missing — hold
        await db
          .update(schema.campaignSteps)
          .set({ status: 'on_hold' })
          .where(eq(schema.campaignSteps.id, dep.id))
        continue
      }
      if (when.getTime() <= now) {
        // Already past the scheduled window while parent was still running — hold
        await db
          .update(schema.campaignSteps)
          .set({ status: 'on_hold' })
          .where(eq(schema.campaignSteps.id, dep.id))
        await emitCampaignOnHold(campaignId)
      } else {
        await db
          .update(schema.campaignSteps)
          .set({ status: 'ready' })
          .where(eq(schema.campaignSteps.id, dep.id))
        await db
          .update(schema.posts)
          .set({ status: 'scheduled', scheduledAt: when })
          .where(eq(schema.posts.id, dep.postId))
      }
    }
  }
}

async function workspaceForPost(postId: string): Promise<string> {
  const p = await db
    .select({ workspaceId: schema.posts.workspaceId })
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1)
  return p[0]?.workspaceId ?? ''
}

async function recomputeCampaignStatus(campaignId: string) {
  const steps = await db
    .select({ status: schema.campaignSteps.status })
    .from(schema.campaignSteps)
    .where(eq(schema.campaignSteps.campaignId, campaignId))
  if (steps.length === 0) return

  const statuses = new Set(steps.map((s) => s.status))
  let campaignStatus: (typeof schema.campaignStatusEnum.enumValues)[number] = 'publishing'
  if (statuses.has('on_hold')) campaignStatus = 'on_hold'
  else if ([...statuses].every((s) => s === 'published')) campaignStatus = 'published'
  else if (statuses.has('failed') && statuses.has('published')) campaignStatus = 'partial'
  else if ([...statuses].every((s) => s === 'failed')) campaignStatus = 'failed'
  else if ([...statuses].every((s) => s === 'waiting' || s === 'ready')) campaignStatus = 'scheduled'

  await db
    .update(schema.campaigns)
    .set({ status: campaignStatus, updatedAt: new Date() })
    .where(eq(schema.campaigns.id, campaignId))
}

async function emitCampaignOnHold(campaignId: string) {
  const camp = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, campaignId),
  })
  if (!camp) return
  const members = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, camp.workspaceId))
  for (const m of members) {
    await db.insert(schema.notifications).values({
      userId: m.userId,
      workspaceId: camp.workspaceId,
      type: 'campaign_on_hold',
      title: `Campaign "${camp.name}" is on hold`,
      body: 'A step failed or its schedule window was missed.',
      data: { campaignId },
    })
  }
  await publishWebhookEvent(camp.workspaceId, 'campaign.on_hold', {
    campaignId,
    workspaceId: camp.workspaceId,
    name: camp.name,
  })
}
