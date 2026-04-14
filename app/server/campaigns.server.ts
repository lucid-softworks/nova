import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import type { PlatformKey } from '~/lib/platforms'

export type CampaignStepInput = {
  clientId: string
  selectedAccountIds: string[]
  content: string
  mediaIds: string[]
  dependsOnClientStepId: string | null
  triggerType: 'immediate' | 'delay' | 'scheduled' | null
  triggerDelayMinutes: number | null
  triggerScheduledAt: string | null
}

export type SaveCampaignInput = {
  workspaceSlug: string
  name: string
  asDraft: boolean
  steps: CampaignStepInput[]
}

export type SaveCampaignResult = {
  campaignId: string
  stepIds: Record<string, string>
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

export async function saveCampaignImpl(input: SaveCampaignInput): Promise<SaveCampaignResult> {
  if (!input.name.trim()) throw new Error('Campaign name is required')
  if (input.steps.length === 0) throw new Error('At least one step is required')

  const { workspace, user } = await ensureWs(input.workspaceSlug)

  // Validate account ownership
  const allAccountIds = [...new Set(input.steps.flatMap((s) => s.selectedAccountIds))]
  if (allAccountIds.length > 0) {
    const valid = await db
      .select({ id: schema.socialAccounts.id })
      .from(schema.socialAccounts)
      .where(
        and(
          eq(schema.socialAccounts.workspaceId, workspace.id),
          inArray(schema.socialAccounts.id, allAccountIds),
        ),
      )
    if (valid.length !== allAccountIds.length) {
      throw new Error('One or more accounts not found in this workspace')
    }
  }

  // If scheduling, validate root step(s) have a scheduledAt
  if (!input.asDraft) {
    for (const s of input.steps) {
      if (s.selectedAccountIds.length === 0) throw new Error('Every step needs at least one account')
      if (!s.dependsOnClientStepId && !s.triggerScheduledAt) {
        throw new Error('Root steps must have a scheduled time')
      }
    }
  }

  return await db.transaction(async (tx) => {
    const [camp] = await tx
      .insert(schema.campaigns)
      .values({
        workspaceId: workspace.id,
        authorId: user.id,
        name: input.name.trim(),
        status: input.asDraft ? 'draft' : 'scheduled',
      })
      .returning()
    if (!camp) throw new Error('Failed to create campaign')

    const clientToStepId: Record<string, string> = {}
    const clientToPostId: Record<string, string> = {}

    // Insert all steps in two passes: create then backfill dependsOnStepId
    for (const s of input.steps) {
      const isRoot = !s.dependsOnClientStepId
      const scheduledAt = isRoot && s.triggerScheduledAt ? new Date(s.triggerScheduledAt) : null

      const [post] = await tx
        .insert(schema.posts)
        .values({
          workspaceId: workspace.id,
          authorId: user.id,
          type: 'original',
          status: input.asDraft ? 'draft' : 'scheduled',
          campaignId: camp.id,
          scheduledAt,
        })
        .returning({ id: schema.posts.id })
      if (!post) throw new Error('Failed to create step post')
      clientToPostId[s.clientId] = post.id

      const accounts = await tx
        .select({
          id: schema.socialAccounts.id,
          platform: schema.socialAccounts.platform,
        })
        .from(schema.socialAccounts)
        .where(inArray(schema.socialAccounts.id, s.selectedAccountIds))
      const platforms = [...new Set(accounts.map((a) => a.platform as PlatformKey))]

      await tx.insert(schema.postVersions).values({
        postId: post.id,
        platforms,
        content: s.content,
        firstComment: null,
        isThread: false,
        isDefault: true,
      })

      for (const sid of s.selectedAccountIds) {
        await tx.insert(schema.postPlatforms).values({ postId: post.id, socialAccountId: sid })
      }
      for (let i = 0; i < s.mediaIds.length; i++) {
        const mid = s.mediaIds[i]
        if (!mid) continue
        // Media is attached at the version level in this schema; find it back
        const versions = await tx
          .select({ id: schema.postVersions.id })
          .from(schema.postVersions)
          .where(eq(schema.postVersions.postId, post.id))
          .limit(1)
        const vid = versions[0]?.id
        if (vid) {
          await tx
            .insert(schema.postMedia)
            .values({ postVersionId: vid, mediaId: mid, sortOrder: i })
        }
      }

      // Create the campaign step without dependsOnStepId yet
      const stepStatus = input.asDraft
        ? 'waiting'
        : isRoot
          ? scheduledAt && scheduledAt.getTime() > Date.now()
            ? 'ready'
            : 'ready'
          : 'waiting'

      const [step] = await tx
        .insert(schema.campaignSteps)
        .values({
          campaignId: camp.id,
          postId: post.id,
          stepOrder: input.steps.indexOf(s),
          dependsOnStepId: null,
          triggerType: isRoot ? null : s.triggerType,
          triggerDelayMinutes: s.triggerDelayMinutes,
          triggerScheduledAt:
            !isRoot && s.triggerType === 'scheduled' && s.triggerScheduledAt
              ? new Date(s.triggerScheduledAt)
              : isRoot && scheduledAt
                ? scheduledAt
                : null,
          status: stepStatus,
        })
        .returning({ id: schema.campaignSteps.id })
      if (!step) throw new Error('Failed to create campaign step')
      clientToStepId[s.clientId] = step.id

      // Record post_platforms also gets reflected via postId. Link campaignStepId on posts.
      await tx
        .update(schema.posts)
        .set({ campaignStepId: step.id })
        .where(eq(schema.posts.id, post.id))

      await tx.insert(schema.postActivity).values({
        postId: post.id,
        userId: user.id,
        action: 'created',
      })
    }

    // Pass 2: wire dependsOnStepId
    for (const s of input.steps) {
      if (!s.dependsOnClientStepId) continue
      const selfId = clientToStepId[s.clientId]
      const depId = clientToStepId[s.dependsOnClientStepId]
      if (!selfId || !depId) continue
      await tx
        .update(schema.campaignSteps)
        .set({ dependsOnStepId: depId })
        .where(eq(schema.campaignSteps.id, selfId))
    }

    return { campaignId: camp.id, stepIds: clientToStepId }
  })
}
