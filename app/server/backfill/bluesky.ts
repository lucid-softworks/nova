import { and, eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { decrypt, encrypt } from '~/lib/encryption'
import { requireWorkspaceAccess } from '~/server/session.server'
import { logger } from '~/lib/logger'

const PLC_DIRECTORY = 'https://plc.directory'

async function resolvePds(did: string): Promise<string> {
  const res = await fetch(`${PLC_DIRECTORY}/${encodeURIComponent(did)}`)
  if (!res.ok) throw new Error(`DID resolution failed (${res.status})`)
  const doc = (await res.json()) as {
    service?: Array<{ id: string; type: string; serviceEndpoint: string }>
  }
  const pds = doc.service?.find((s) => s.id === '#atproto_pds')
  if (!pds) throw new Error('No #atproto_pds service in DID document')
  return pds.serviceEndpoint.replace(/\/+$/, '')
}

async function refreshSession(
  pdsUrl: string,
  refreshJwt: string,
): Promise<{ did: string; accessJwt: string; refreshJwt: string }> {
  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshJwt}` },
  })
  if (!res.ok) throw new Error(`Bluesky session refresh failed (${res.status})`)
  return (await res.json()) as { did: string; accessJwt: string; refreshJwt: string }
}

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

  let accessToken = decrypt(account.accessToken)
  const refreshToken = account.refreshToken ? decrypt(account.refreshToken) : null
  const did = (account.metadata as Record<string, unknown>)?.did as string
  if (!did) throw new Error('Bluesky account missing DID — reconnect it')

  const pdsUrl = await resolvePds(did)
  logger.info({ socialAccountId, pdsUrl }, 'resolved bluesky PDS')

  // Bluesky JWTs expire after ~2h. Proactively refresh before starting.
  if (refreshToken) {
    logger.info({ socialAccountId }, 'attempting bluesky session refresh')
    try {
      const fresh = await refreshSession(pdsUrl, refreshToken)
      accessToken = fresh.accessJwt
      await db
        .update(schema.socialAccounts)
        .set({
          accessToken: encrypt(fresh.accessJwt),
          refreshToken: encrypt(fresh.refreshJwt),
          lastSyncedAt: new Date(),
        })
        .where(eq(schema.socialAccounts.id, socialAccountId))
      logger.info({ socialAccountId }, 'bluesky session refreshed')
    } catch (e) {
      logger.warn(
        { err: e instanceof Error ? e.message : String(e) },
        'bluesky session refresh failed, trying with existing token',
      )
    }
  } else {
    logger.warn({ socialAccountId }, 'no refresh token available')
  }

  let imported = 0
  let skipped = 0
  let total = 0
  let cursor: string | undefined

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${pdsUrl}/xrpc/app.bsky.feed.getAuthorFeed`)
    url.searchParams.set('actor', did)
    url.searchParams.set('limit', '50')
    url.searchParams.set('filter', 'posts_no_replies')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.warn({ status: res.status, body: body.slice(0, 300) }, 'bluesky getAuthorFeed failed')
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
