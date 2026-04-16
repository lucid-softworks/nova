import { and, eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { decrypt } from '~/lib/encryption'
import { requireWorkspaceAccess } from '~/server/session.server'
import { logger } from '~/lib/logger'

const SERVICE = 'https://bsky.social'

type FeedPost = {
  post: {
    uri: string
    cid: string
    author: { did: string; handle: string }
    record: {
      text?: string
      createdAt?: string
      $type?: string
    }
    likeCount?: number
    repostCount?: number
    replyCount?: number
  }
  reason?: unknown
}

type FeedResponse = {
  feed?: FeedPost[]
  cursor?: string
}

function postUrl(handle: string, uri: string): string {
  const rkey = uri.split('/').pop()
  return `https://bsky.app/profile/${handle}/post/${rkey}`
}

export type BackfillResult = { imported: number; skipped: number; total: number }

export async function backfillBlueskyImpl(
  workspaceSlug: string,
  socialAccountId: string,
  maxPages = 5,
): Promise<BackfillResult> {
  const r = await requireWorkspaceAccess(workspaceSlug)
  if (!r.ok) throw new Error(r.reason)

  const account = await db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.id, socialAccountId),
      eq(schema.socialAccounts.workspaceId, r.workspace.id),
    ),
  })
  if (!account) throw new Error('Account not found')
  if (account.platform !== 'bluesky') throw new Error('Not a Bluesky account')

  const accessToken = decrypt(account.accessToken)
  const did = (account.metadata as Record<string, unknown>)?.did as string
  if (!did) throw new Error('Bluesky account missing DID — reconnect it')

  let imported = 0
  let skipped = 0
  let total = 0
  let cursor: string | undefined

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${SERVICE}/xrpc/app.bsky.feed.getAuthorFeed`)
    url.searchParams.set('actor', did)
    url.searchParams.set('limit', '50')
    url.searchParams.set('filter', 'posts_no_replies')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      logger.warn({ status: res.status }, 'bluesky getAuthorFeed failed')
      break
    }
    const json = (await res.json()) as FeedResponse
    const items = json.feed ?? []
    if (items.length === 0) break

    for (const item of items) {
      total++
      const p = item.post
      // Skip reposts of other people's content.
      if (item.reason || p.author.did !== did) {
        skipped++
        continue
      }
      // Skip non-post record types (e.g. app.bsky.feed.repost).
      if (p.record.$type && p.record.$type !== 'app.bsky.feed.post') {
        skipped++
        continue
      }

      // Dedup: already imported?
      const existing = await db.query.postPlatforms.findFirst({
        where: and(
          eq(schema.postPlatforms.socialAccountId, socialAccountId),
          eq(schema.postPlatforms.platformPostId, p.uri),
        ),
      })
      if (existing) {
        skipped++
        continue
      }

      const publishedAt = p.record.createdAt ? new Date(p.record.createdAt) : new Date()
      const content = p.record.text ?? ''

      try {
        await db.transaction(async (tx) => {
          const [post] = await tx
            .insert(schema.posts)
            .values({
              workspaceId: r.workspace.id,
              authorId: r.user.id,
              type: 'original',
              status: 'published',
              publishedAt,
            })
            .returning({ id: schema.posts.id })
          if (!post) return

          await tx.insert(schema.postVersions).values({
            postId: post.id,
            platforms: ['bluesky'],
            content,
            firstComment: null,
            isThread: false,
            threadParts: [],
            isDefault: true,
            platformVariables: {},
          })

          await tx.insert(schema.postPlatforms).values({
            postId: post.id,
            socialAccountId,
            platformPostId: p.uri,
            publishedUrl: postUrl(p.author.handle, p.uri),
            status: 'published',
            publishedAt,
          })
        })
        imported++
      } catch (e) {
        logger.warn(
          { err: e instanceof Error ? e.message : String(e), uri: p.uri },
          'backfill post insert failed',
        )
        skipped++
      }
    }

    cursor = json.cursor
    if (!cursor) break
  }

  // Trigger an immediate analytics sync so engagement numbers show up
  // without waiting for the 02:00 UTC cron.
  try {
    const { enqueueManualSync } = await import('~/server/queues/analyticsSync')
    await enqueueManualSync({ workspaceId: r.workspace.id, socialAccountId })
  } catch {
    // Non-fatal — analytics will catch up on the next scheduled run.
  }

  logger.info(
    { socialAccountId, imported, skipped, total },
    'bluesky backfill complete',
  )
  return { imported, skipped, total }
}
