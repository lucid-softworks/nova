import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { logger } from '~/lib/logger'
import { applyTemplate, parseFeed } from './parse'

/**
 * Poll one feed: fetch, parse, upsert items, create draft posts for
 * anything we haven't seen before. Safe to call concurrently across
 * replicas — the (feedId, guid) unique index drops the race cleanly.
 */
export async function pollFeed(feedId: string): Promise<{ created: number; seen: number }> {
  const feed = await db.query.rssFeeds.findFirst({
    where: eq(schema.rssFeeds.id, feedId),
  })
  if (!feed || !feed.active) return { created: 0, seen: 0 }

  const res = await fetch(feed.url, { headers: { 'User-Agent': 'nova-rss/1.0' } })
  if (!res.ok) {
    logger.warn({ feedId, url: feed.url, status: res.status }, 'rss fetch failed')
    return { created: 0, seen: 0 }
  }
  const xml = await res.text()
  const parsed = parseFeed(xml)

  let created = 0
  let seen = 0
  for (const item of parsed.items) {
    seen++
    // Dedup: the unique index means we can attempt insert and swallow the
    // conflict, but explicit check is cheaper than a round-trip when we
    // already know the feed is in a steady state.
    const existing = await db.query.rssFeedItems.findFirst({
      where: and(
        eq(schema.rssFeedItems.feedId, feed.id),
        eq(schema.rssFeedItems.guid, item.guid),
      ),
    })
    if (existing) continue

    let postId: string | null = null
    const content = applyTemplate(feed.contentTemplate, item)

    if (feed.autoPublish && feed.defaultAccountIds.length > 0) {
      // Verify accounts still exist + belong to this workspace before using.
      const accounts = await db
        .select({
          id: schema.socialAccounts.id,
          platform: schema.socialAccounts.platform,
        })
        .from(schema.socialAccounts)
        .where(
          and(
            eq(schema.socialAccounts.workspaceId, feed.workspaceId),
            inArray(schema.socialAccounts.id, feed.defaultAccountIds),
          ),
        )
      if (accounts.length > 0) {
        const result = await db.transaction(async (tx) => {
          const [post] = await tx
            .insert(schema.posts)
            .values({
              workspaceId: feed.workspaceId,
              authorId: feed.createdById,
              type: 'original',
              status: 'scheduled',
              scheduledAt: new Date(Date.now() + 5 * 60_000),
            })
            .returning({ id: schema.posts.id })
          if (!post) throw new Error('post insert failed')
          await tx.insert(schema.postVersions).values({
            postId: post.id,
            platforms: [...new Set(accounts.map((a) => a.platform))] as never,
            content,
            firstComment: null,
            isThread: false,
            threadParts: [],
            isDefault: true,
            platformVariables: {},
          })
          for (const a of accounts) {
            await tx.insert(schema.postPlatforms).values({
              postId: post.id,
              socialAccountId: a.id,
              status: 'pending',
            })
          }
          return post.id
        })
        postId = result
      }
    }

    // Fallback to a draft if we didn't auto-publish.
    if (!postId) {
      const [post] = await db
        .insert(schema.posts)
        .values({
          workspaceId: feed.workspaceId,
          authorId: feed.createdById,
          type: 'original',
          status: 'draft',
        })
        .returning({ id: schema.posts.id })
      if (post) {
        await db.insert(schema.postVersions).values({
          postId: post.id,
          platforms: [],
          content,
          firstComment: null,
          isThread: false,
          threadParts: [],
          isDefault: true,
          platformVariables: {},
        })
        postId = post.id
      }
    }

    await db.insert(schema.rssFeedItems).values({
      feedId: feed.id,
      guid: item.guid,
      link: item.link,
      title: item.title,
      publishedAt: item.publishedAt,
      postId,
    })
    created++
  }

  await db
    .update(schema.rssFeeds)
    .set({ lastPolledAt: new Date(), title: feed.title ?? parsed.title })
    .where(eq(schema.rssFeeds.id, feed.id))

  return { created, seen }
}

export async function pollAllActive(): Promise<void> {
  const feeds = await db
    .select({ id: schema.rssFeeds.id })
    .from(schema.rssFeeds)
    .where(eq(schema.rssFeeds.active, true))
  for (const f of feeds) {
    try {
      await pollFeed(f.id)
    } catch (e) {
      logger.error(
        { feedId: f.id, err: e instanceof Error ? e.message : String(e) },
        'rss poll failed',
      )
    }
  }
}
