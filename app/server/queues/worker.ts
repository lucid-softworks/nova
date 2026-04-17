import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { decrypt } from '~/lib/encryption'
import {
  publishOriginal,
  publishReshare,
  type PublishAccount,
  type PublishContext,
  type PublishMedia,
  type PublishRedditFields,
  type PublishVersion,
  type ReshareContext,
  type ResharePayload,
} from '~/server/publishing'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { getRedis } from './connection'
import type { PostJobData } from './postQueue'
import { onStepComplete } from './campaignWorker'
import { buildVariableMap, substitute } from '~/server/publishing/variables'
import { isPublishError } from '~/server/publishing/errors'
import { notifyUser } from '~/server/notifications.server'
import { publishWebhookEvent } from '~/server/webhooks.server'
import { logger } from '~/lib/logger'
import { captureError } from '~/lib/sentry'
import { appendUtmParams, mergeUtmParams, type UtmParams } from '~/lib/utm'

let worker: Worker<PostJobData> | null = null

export function getPostWorker(): Worker<PostJobData> {
  if (worker) return worker
  worker = new Worker<PostJobData>('posts', processJob, {
    connection: getRedis(),
    concurrency: 4,
  })
  worker.on('failed', (job, err) => {
    logger.error(
      { queue: 'posts', jobId: job?.id, postId: job?.data.postId, err: err.message },
      'job failed',
    )
    captureError(err, { jobId: job?.id, postId: job?.data.postId })
  })
  worker.on('completed', (job) => {
    logger.info({ queue: 'posts', jobId: job.id, postId: job.data.postId }, 'job completed')
  })
  return worker
}

export function resetPostWorker() {
  worker = null
}

async function processJob(job: { data: PostJobData }) {
  const { postId } = job.data
  const post = await db.query.posts.findFirst({
    where: eq(schema.posts.id, postId),
  })
  if (!post) throw new Error(`post ${postId} not found`)

  const versions = await db
    .select()
    .from(schema.postVersions)
    .where(eq(schema.postVersions.postId, postId))
  const platformTargets = await db
    .select({
      platform: schema.postPlatforms,
      account: schema.socialAccounts,
    })
    .from(schema.postPlatforms)
    .innerJoin(
      schema.socialAccounts,
      eq(schema.socialAccounts.id, schema.postPlatforms.socialAccountId),
    )
    .where(eq(schema.postPlatforms.postId, postId))

  let reshareDetails: ResharePayload | null = null
  if (post.type === 'reshare') {
    const r = await db.query.postReshareDetails.findFirst({
      where: eq(schema.postReshareDetails.postId, postId),
    })
    if (r) {
      reshareDetails = {
        sourcePlatform: r.sourcePlatform,
        sourcePostId: r.sourcePostId,
        sourcePostUrl: r.sourcePostUrl,
        reshareType: r.reshareType,
        quoteComment: r.quoteComment,
        targetSubreddit: r.targetSubreddit,
      }
    }
  }

  const mediaByVersion = new Map<string, PublishMedia[]>()
  for (const v of versions) {
    const rows = await db
      .select({
        id: schema.mediaAssets.id,
        url: schema.mediaAssets.url,
        mimeType: schema.mediaAssets.mimeType,
        originalName: schema.mediaAssets.originalName,
        size: schema.mediaAssets.size,
        sortOrder: schema.postMedia.sortOrder,
        altText: schema.postMedia.altText,
      })
      .from(schema.postMedia)
      .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
      .where(eq(schema.postMedia.postVersionId, v.id))
    mediaByVersion.set(
      v.id,
      rows
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((r) => ({
          id: r.id,
          url: r.url,
          mimeType: r.mimeType,
          originalName: r.originalName,
          size: r.size,
          altText: r.altText,
        })),
    )
  }

  const vars = await buildVariableMap(postId)

  let anyFailed = false
  let firstError: string | null = null

  for (const target of platformTargets) {
    const version = pickVersionForPlatform(versions, target.account.platform)
    if (!version) {
      anyFailed = true
      firstError ??= 'no version matches platform'
      await db
        .update(schema.postPlatforms)
        .set({ status: 'failed', failureReason: 'no version matches platform' })
        .where(eq(schema.postPlatforms.id, target.platform.id))
      continue
    }
    const publishAccount: PublishAccount = {
      id: target.account.id,
      platform: target.account.platform,
      accountName: target.account.accountName,
      accountHandle: target.account.accountHandle,
      workspaceId: target.account.workspaceId,
      accessToken: safeDecrypt(target.account.accessToken),
      refreshToken: target.account.refreshToken ? safeDecrypt(target.account.refreshToken) : null,
      metadata: (target.account.metadata ?? {}) as Record<string, unknown>,
    }
    const publishVersion: PublishVersion = {
      id: version.id,
      content: substitute(version.content, vars),
      firstComment: version.firstComment ? substitute(version.firstComment, vars) : null,
      isThread: version.isThread,
      threadParts: ((version.threadParts as { content: string; mediaIds: string[] }[]) ?? []).map(
        (p) => ({ content: substitute(p.content, vars), mediaIds: p.mediaIds }),
      ),
      mediaIds: [],
      platformVariables: (version.platformVariables as Record<string, string>) ?? {},
    }

    // UTM: merge workspace defaults + per-post overrides, then rewrite links.
    const ws = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, post.workspaceId),
      columns: { utmDefaults: true },
    })
    const utmParams = mergeUtmParams(
      (ws?.utmDefaults ?? {}) as UtmParams,
      publishVersion.platformVariables,
    )
    publishVersion.content = appendUtmParams(publishVersion.content, utmParams)
    for (const part of publishVersion.threadParts) {
      part.content = appendUtmParams(part.content, utmParams)
    }

    try {
      let result
      if (post.type === 'reshare' && reshareDetails) {
        const ctx: ReshareContext = { account: publishAccount, reshare: reshareDetails }
        result = await publishReshare(ctx)
      } else {
        const ctx: PublishContext = {
          account: publishAccount,
          version: publishVersion,
          media: mediaByVersion.get(version.id) ?? [],
          reddit: await loadRedditForPlatform(post.id, target.account.platform),
        }
        result = await publishOriginal(ctx)
      }

      await db
        .update(schema.postPlatforms)
        .set({
          status: 'published',
          platformPostId: result.platformPostId,
          publishedUrl: result.url,
          publishedAt: result.publishedAt,
          failureReason: null,
        })
        .where(eq(schema.postPlatforms.id, target.platform.id))

      // Record the returned URL into the version's platformVariables so
      // campaign dependents that referenced {stepN_<platform>_url} can
      // resolve it (the substitution reads from buildVariableMap, but we
      // also persist this for observability and UI surfacing).
      const varName = PLATFORMS[target.account.platform].urlVariableName
      if (varName && result.url) {
        const existing = (version.platformVariables as Record<string, string>) ?? {}
        await db
          .update(schema.postVersions)
          .set({ platformVariables: { ...existing, [varName]: result.url } })
          .where(eq(schema.postVersions.id, version.id))
      }
    } catch (err) {
      anyFailed = true
      const msg = err instanceof Error ? err.message : 'publish failed'
      const userMsg = isPublishError(err) ? err.userMessage : msg
      firstError ??= userMsg
      await db
        .update(schema.postPlatforms)
        .set({ status: 'failed', failureReason: userMsg })
        .where(eq(schema.postPlatforms.id, target.platform.id))

      if (isPublishError(err) && err.code === 'AUTH_EXPIRED') {
        await db
          .update(schema.socialAccounts)
          .set({ status: 'expired' })
          .where(eq(schema.socialAccounts.id, target.account.id))
        // Notify everyone in the workspace so they can reconnect.
        const members = await db
          .select({ userId: schema.member.userId })
          .from(schema.member)
          .innerJoin(
            schema.workspaces,
            eq(schema.workspaces.organizationId, schema.member.organizationId),
          )
          .where(eq(schema.workspaces.id, target.account.workspaceId))
        for (const m of members) {
          await db.insert(schema.notifications).values({
            userId: m.userId,
            workspaceId: target.account.workspaceId,
            type: 'post_failed',
            title: `${PLATFORMS[target.account.platform].label} needs reconnection`,
            body: `@${target.account.accountHandle}'s token is expired.`,
            data: { socialAccountId: target.account.id, postId },
          })
        }
      }
    }
  }

  if (anyFailed) {
    await db
      .update(schema.posts)
      .set({ status: 'failed', failedAt: new Date(), failureReason: firstError })
      .where(eq(schema.posts.id, postId))
    await db.insert(schema.postActivity).values({ postId, action: 'failed', note: firstError })
    if (post.authorId) {
      await notifyUser({
        userId: post.authorId,
        workspaceId: post.workspaceId,
        type: 'post_failed',
        title: 'Your post failed to publish',
        body: firstError ?? 'Publish failed',
        data: { postId },
      })
    }
    await publishWebhookEvent(post.workspaceId, 'post.failed', {
      postId,
      workspaceId: post.workspaceId,
      failureReason: firstError,
    })
  } else {
    await db
      .update(schema.posts)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(schema.posts.id, postId))
    await db.insert(schema.postActivity).values({ postId, action: 'published' })
    if (post.authorId) {
      await notifyUser({
        userId: post.authorId,
        workspaceId: post.workspaceId,
        type: 'post_published',
        title: 'Your post published',
        body: platformTargets.map((t) => t.account.platform).join(', ') || 'Published',
        data: { postId },
      })
    }
    await publishWebhookEvent(post.workspaceId, 'post.published', {
      postId,
      workspaceId: post.workspaceId,
      platforms: platformTargets.map((t) => ({
        platform: t.account.platform,
        accountHandle: t.account.accountHandle,
      })),
    })
  }

  if (post.campaignStepId) {
    await onStepComplete(post.campaignStepId, !anyFailed)
  }
}

function pickVersionForPlatform(versions: { platforms: string[] }[], platform: PlatformKey) {
  return (
    versions.find((v) => v.platforms.includes(platform)) ??
    // fallback to default-flagged version if present
    (versions as unknown as { isDefault: boolean }[]).find((v) => v.isDefault) ??
    versions[0]
  ) as (typeof versions)[number] & {
    id: string
    content: string
    firstComment: string | null
    isThread: boolean
    threadParts: unknown
    platformVariables: unknown
  }
}

async function loadRedditForPlatform(
  _postId: string,
  platform: PlatformKey,
): Promise<PublishRedditFields> {
  if (platform !== 'reddit') return null
  // Reddit fields aren't persisted yet (they live on the UI state only in Stage 3).
  // Stage 10/17 introduces a post-level reddit_fields row; stub for now.
  return null
}

function safeDecrypt(v: string): string {
  if (!v) return ''
  try {
    return decrypt(v)
  } catch (err) {
    logger.warn({ err }, 'Token decryption failed — possible key rotation issue')
    return ''
  }
}
