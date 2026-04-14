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
import type { PlatformKey } from '~/lib/platforms'
import { getRedis } from './connection'
import type { PostJobData } from './postQueue'
import { onStepComplete } from './campaignWorker'

let worker: Worker<PostJobData> | null = null

export function getPostWorker(): Worker<PostJobData> {
  if (worker) return worker
  worker = new Worker<PostJobData>('posts', processJob, {
    connection: getRedis(),
    concurrency: 4,
  })
  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message)
  })
  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} completed`)
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
        sortOrder: schema.postMedia.sortOrder,
      })
      .from(schema.postMedia)
      .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
      .where(eq(schema.postMedia.postVersionId, v.id))
    mediaByVersion.set(
      v.id,
      rows
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((r) => ({ id: r.id, url: r.url, mimeType: r.mimeType, originalName: r.originalName })),
    )
  }

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
      content: version.content,
      firstComment: version.firstComment,
      isThread: version.isThread,
      threadParts: (version.threadParts as { content: string; mediaIds: string[] }[]) ?? [],
      mediaIds: [],
      platformVariables: (version.platformVariables as Record<string, string>) ?? {},
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
    } catch (err) {
      anyFailed = true
      const msg = err instanceof Error ? err.message : 'publish failed'
      firstError ??= msg
      await db
        .update(schema.postPlatforms)
        .set({ status: 'failed', failureReason: msg })
        .where(eq(schema.postPlatforms.id, target.platform.id))
    }
  }

  if (anyFailed) {
    await db
      .update(schema.posts)
      .set({ status: 'failed', failedAt: new Date(), failureReason: firstError })
      .where(eq(schema.posts.id, postId))
    await db.insert(schema.postActivity).values({ postId, action: 'failed', note: firstError })
  } else {
    await db
      .update(schema.posts)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(schema.posts.id, postId))
    await db.insert(schema.postActivity).values({ postId, action: 'published' })
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
  } catch {
    return ''
  }
}
