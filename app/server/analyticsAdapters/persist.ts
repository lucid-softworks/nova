import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import type { AccountSnapshot, PostSnapshot } from './types'

/**
 * Upsert today's account snapshot. Keyed by (socialAccountId, date) so
 * re-running the sync on the same day overwrites rather than duplicating.
 */
export async function upsertAccountSnapshot(
  socialAccountId: string,
  date: string,
  snap: AccountSnapshot,
): Promise<void> {
  const values = {
    socialAccountId,
    date,
    followers: snap.followers ?? 0,
    following: snap.following ?? 0,
    posts: snap.posts ?? 0,
    reach: snap.reach ?? 0,
    impressions: snap.impressions ?? 0,
    engagements: snap.engagements ?? 0,
    likes: snap.likes ?? 0,
    comments: snap.comments ?? 0,
    shares: snap.shares ?? 0,
    clicks: snap.clicks ?? 0,
  }
  // Drizzle's onConflictDoUpdate path requires a matching uniqueIndex; our
  // analytics_snapshots table doesn't have one yet, so fall back to a
  // query-then-update. Cheap: one index-scan per (account, date).
  const existing = await db
    .select({ id: schema.analyticsSnapshots.id })
    .from(schema.analyticsSnapshots)
    .where(
      and(
        eq(schema.analyticsSnapshots.socialAccountId, socialAccountId),
        eq(schema.analyticsSnapshots.date, date),
      ),
    )
    .limit(1)
  if (existing[0]) {
    await db
      .update(schema.analyticsSnapshots)
      .set(values)
      .where(eq(schema.analyticsSnapshots.id, existing[0].id))
  } else {
    await db.insert(schema.analyticsSnapshots).values(values)
  }
}

export async function upsertPostSnapshots(
  socialAccountId: string,
  date: string,
  snaps: PostSnapshot[],
): Promise<void> {
  if (snaps.length === 0) return
  // Resolve platformPostId → postPlatforms.id for this account.
  const ids = snaps.map((s) => s.platformPostId)
  const rows = await db
    .select({
      id: schema.postPlatforms.id,
      platformPostId: schema.postPlatforms.platformPostId,
    })
    .from(schema.postPlatforms)
    .where(
      and(
        eq(schema.postPlatforms.socialAccountId, socialAccountId),
        inArray(schema.postPlatforms.platformPostId, ids),
      ),
    )
  const map = new Map(rows.map((r) => [r.platformPostId ?? '', r.id]))

  for (const s of snaps) {
    const ppId = map.get(s.platformPostId)
    if (!ppId) continue
    const values = {
      postPlatformId: ppId,
      date,
      likes: s.likes ?? 0,
      comments: s.comments ?? 0,
      shares: s.shares ?? 0,
      reach: s.reach ?? 0,
      impressions: s.impressions ?? 0,
      engagements: s.engagements ?? 0,
      clicks: s.clicks ?? 0,
      views: s.views ?? 0,
    }
    await db
      .insert(schema.postMetricsSnapshots)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.postMetricsSnapshots.postPlatformId, schema.postMetricsSnapshots.date],
        set: values,
      })
  }
}

export async function markAccountExpired(socialAccountId: string): Promise<void> {
  await db
    .update(schema.socialAccounts)
    .set({ status: 'expired' })
    .where(eq(schema.socialAccounts.id, socialAccountId))
}

export async function markAccountSynced(socialAccountId: string): Promise<void> {
  await db
    .update(schema.socialAccounts)
    .set({ lastSyncedAt: new Date() })
    .where(eq(schema.socialAccounts.id, socialAccountId))
}
