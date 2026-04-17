import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { logger } from '~/lib/logger'
import { searchBluesky } from './bluesky'

/**
 * Walks every enabled keyword watch, queries the relevant platform, and
 * inserts any new matches. Uses the unique (watch_id, external_post_id)
 * index for dedupe via onConflictDoNothing.
 */
export async function pollAllMonitors(): Promise<void> {
  const watches = await db.select().from(schema.keywordWatches).where(eq(schema.keywordWatches.enabled, true))
  for (const w of watches) {
    if (w.platform !== 'bluesky') continue
    try {
      const since = w.lastCheckedAt ? w.lastCheckedAt.toISOString() : null
      const hits = await searchBluesky(w.term, since)
      if (hits.length > 0) {
        const rows = hits.map((h) => ({
          watchId: w.id,
          workspaceId: w.workspaceId,
          externalPostId: h.uri,
          authorHandle: h.authorHandle,
          authorName: h.authorName,
          authorAvatar: h.authorAvatar,
          content: h.content,
          postUrl: h.postUrl,
          publishedAt: h.publishedAt ? new Date(h.publishedAt) : null,
        }))
        await db
          .insert(schema.keywordMatches)
          .values(rows)
          .onConflictDoNothing({
            target: [schema.keywordMatches.watchId, schema.keywordMatches.externalPostId],
          })
      }
      await db
        .update(schema.keywordWatches)
        .set({ lastCheckedAt: new Date() })
        .where(eq(schema.keywordWatches.id, w.id))
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), watchId: w.id, term: w.term },
        'keyword watch poll failed',
      )
    }
  }
}
