import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import type { PlatformKey } from '~/lib/platforms'

export type AnalyticsRange = '7d' | '30d' | '90d' | 'custom'

export type CustomRange = { fromIso: string; toIso: string } | null

export type AnalyticsSummary = {
  totalPosts: number
  totalReshares: number
  totalReach: number
  totalEngagements: number
  avgEngagementRate: number
  followerGrowth: number
  delta: {
    totalPosts: number
    totalReshares: number
    totalReach: number
    totalEngagements: number
    avgEngagementRate: number
    followerGrowth: number
  }
}

export type FollowerPoint = {
  date: string
  byAccount: Record<string, number>
}

export type DailyEngagementRow = {
  date: string
  likes: number
  comments: number
  shares: number
  clicks: number
}

export type PlatformTableRow = {
  accountId: string
  platform: PlatformKey
  accountHandle: string
  accountName: string
  posts: number
  reshares: number
  reach: number
  impressions: number
  likes: number
  comments: number
  shares: number
  clicks: number
  engagementRate: number
}

export type TopPostRow = {
  id: string
  content: string
  platforms: PlatformKey[]
  thumbnailUrl: string | null
  likes: number
  comments: number
  shares: number
  clicks: number
  engagements: number
  publishedAt: string | null
  publishedUrl: string | null
}

export type HeatmapRow = { dayOfWeek: number; hour: number; avgEngagements: number; posts: number }

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

function rangeToDays(r: AnalyticsRange): number {
  return r === '7d' ? 7 : r === '30d' ? 30 : r === '90d' ? 90 : 30
}

function rangeWindow(
  range: AnalyticsRange,
  custom: CustomRange = null,
  anchor: Date = new Date(),
) {
  if (range === 'custom' && custom) {
    const start = new Date(custom.fromIso)
    start.setHours(0, 0, 0, 0)
    const end = new Date(custom.toIso)
    end.setHours(23, 59, 59, 999)
    const dayMs = 24 * 60 * 60 * 1000
    const spanMs = end.getTime() - start.getTime() + 1
    const prevEnd = new Date(start.getTime() - 1)
    const prevStart = new Date(prevEnd.getTime() - spanMs + dayMs)
    prevStart.setHours(0, 0, 0, 0)
    return { start, end, prevStart, prevEnd }
  }
  const days = rangeToDays(range)
  const end = new Date(anchor)
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - days + 1)
  start.setHours(0, 0, 0, 0)
  const prevEnd = new Date(start)
  prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - days + 1)
  prevStart.setHours(0, 0, 0, 0)
  return { start, end, prevStart, prevEnd }
}

function accountFilter(accountId: string | null) {
  return accountId ? eq(schema.analyticsSnapshots.socialAccountId, accountId) : undefined
}

async function workspaceAccountIds(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.socialAccounts.id })
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.workspaceId, workspaceId))
  return rows.map((r) => r.id)
}

async function sumSnapshots(workspaceId: string, start: Date, end: Date, accountId: string | null) {
  const accountIds = await workspaceAccountIds(workspaceId)
  if (accountIds.length === 0) {
    return {
      reach: 0,
      impressions: 0,
      engagements: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: 0,
      followers: 0,
      followersStart: 0,
    }
  }
  const rows = await db
    .select({
      reach: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.reach}), 0)::int`,
      impressions: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.impressions}), 0)::int`,
      engagements: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.engagements}), 0)::int`,
      likes: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.likes}), 0)::int`,
      comments: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.comments}), 0)::int`,
      shares: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.shares}), 0)::int`,
      clicks: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.clicks}), 0)::int`,
    })
    .from(schema.analyticsSnapshots)
    .where(
      and(
        inArray(schema.analyticsSnapshots.socialAccountId, accountIds),
        gte(schema.analyticsSnapshots.date, sql`${start.toISOString().slice(0, 10)}`),
        lte(schema.analyticsSnapshots.date, sql`${end.toISOString().slice(0, 10)}`),
        accountFilter(accountId),
      ),
    )

  // Follower growth: last follower count in range minus first.
  const firstRows = await db
    .select({ f: schema.analyticsSnapshots.followers })
    .from(schema.analyticsSnapshots)
    .where(
      and(
        inArray(schema.analyticsSnapshots.socialAccountId, accountIds),
        gte(schema.analyticsSnapshots.date, sql`${start.toISOString().slice(0, 10)}`),
        lte(schema.analyticsSnapshots.date, sql`${end.toISOString().slice(0, 10)}`),
        accountFilter(accountId),
      ),
    )
    .orderBy(schema.analyticsSnapshots.date)
    .limit(1)
  const lastRows = await db
    .select({ f: schema.analyticsSnapshots.followers })
    .from(schema.analyticsSnapshots)
    .where(
      and(
        inArray(schema.analyticsSnapshots.socialAccountId, accountIds),
        gte(schema.analyticsSnapshots.date, sql`${start.toISOString().slice(0, 10)}`),
        lte(schema.analyticsSnapshots.date, sql`${end.toISOString().slice(0, 10)}`),
        accountFilter(accountId),
      ),
    )
    .orderBy(desc(schema.analyticsSnapshots.date))
    .limit(1)

  const followers = lastRows[0]?.f ?? 0
  const followersStart = firstRows[0]?.f ?? 0
  return { ...(rows[0] ?? {}), followers, followersStart } as {
    reach: number
    impressions: number
    engagements: number
    likes: number
    comments: number
    shares: number
    clicks: number
    followers: number
    followersStart: number
  }
}

async function countPosts(
  workspaceId: string,
  start: Date,
  end: Date,
  accountId: string | null,
) {
  // Count posts whose any platform target published within range.
  const rows = await db
    .select({
      posts: sql<number>`COUNT(DISTINCT CASE WHEN ${schema.posts.type} = 'original' THEN ${schema.posts.id} END)::int`,
      reshares: sql<number>`COUNT(DISTINCT CASE WHEN ${schema.posts.type} = 'reshare' THEN ${schema.posts.id} END)::int`,
    })
    .from(schema.posts)
    .innerJoin(schema.postPlatforms, eq(schema.postPlatforms.postId, schema.posts.id))
    .where(
      and(
        eq(schema.posts.workspaceId, workspaceId),
        gte(schema.postPlatforms.publishedAt, start),
        lte(schema.postPlatforms.publishedAt, end),
        accountId ? eq(schema.postPlatforms.socialAccountId, accountId) : undefined,
      ),
    )
  return rows[0] ?? { posts: 0, reshares: 0 }
}

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100
  return ((curr - prev) / prev) * 100
}

export async function getSummaryImpl(
  slug: string,
  range: AnalyticsRange,
  accountId: string | null,
  custom: CustomRange = null,
): Promise<AnalyticsSummary> {
  const { workspace } = await ensureWs(slug)
  const { start, end, prevStart, prevEnd } = rangeWindow(range, custom)

  const [curr, prev, currPosts, prevPosts] = await Promise.all([
    sumSnapshots(workspace.id, start, end, accountId),
    sumSnapshots(workspace.id, prevStart, prevEnd, accountId),
    countPosts(workspace.id, start, end, accountId),
    countPosts(workspace.id, prevStart, prevEnd, accountId),
  ])

  const currEngRate = curr.impressions > 0 ? (curr.engagements / curr.impressions) * 100 : 0
  const prevEngRate = prev.impressions > 0 ? (prev.engagements / prev.impressions) * 100 : 0
  const currFollowerGrowth = curr.followers - curr.followersStart
  const prevFollowerGrowth = prev.followers - prev.followersStart

  return {
    totalPosts: currPosts.posts,
    totalReshares: currPosts.reshares,
    totalReach: curr.reach,
    totalEngagements: curr.engagements,
    avgEngagementRate: currEngRate,
    followerGrowth: currFollowerGrowth,
    delta: {
      totalPosts: pct(currPosts.posts, prevPosts.posts),
      totalReshares: pct(currPosts.reshares, prevPosts.reshares),
      totalReach: pct(curr.reach, prev.reach),
      totalEngagements: pct(curr.engagements, prev.engagements),
      avgEngagementRate: pct(currEngRate, prevEngRate),
      followerGrowth: pct(currFollowerGrowth, prevFollowerGrowth),
    },
  }
}

export async function getFollowerSeriesImpl(
  slug: string,
  range: AnalyticsRange,
  accountId: string | null,
  custom: CustomRange = null,
): Promise<FollowerPoint[]> {
  const { workspace } = await ensureWs(slug)
  const { start, end } = rangeWindow(range, custom)
  const accountIds = await workspaceAccountIds(workspace.id)
  if (accountIds.length === 0) return []

  const rows = await db
    .select({
      date: schema.analyticsSnapshots.date,
      accountId: schema.analyticsSnapshots.socialAccountId,
      followers: schema.analyticsSnapshots.followers,
    })
    .from(schema.analyticsSnapshots)
    .where(
      and(
        inArray(schema.analyticsSnapshots.socialAccountId, accountIds),
        gte(schema.analyticsSnapshots.date, sql`${start.toISOString().slice(0, 10)}`),
        lte(schema.analyticsSnapshots.date, sql`${end.toISOString().slice(0, 10)}`),
        accountFilter(accountId),
      ),
    )
    .orderBy(schema.analyticsSnapshots.date)

  const byDate = new Map<string, Record<string, number>>()
  for (const r of rows) {
    const day = byDate.get(r.date) ?? {}
    day[r.accountId] = r.followers
    byDate.set(r.date, day)
  }
  return [...byDate.entries()].map(([date, byAccount]) => ({ date, byAccount }))
}

export async function getDailyEngagementsImpl(
  slug: string,
  range: AnalyticsRange,
  accountId: string | null,
  custom: CustomRange = null,
): Promise<DailyEngagementRow[]> {
  const { workspace } = await ensureWs(slug)
  const { start, end } = rangeWindow(range, custom)
  const accountIds = await workspaceAccountIds(workspace.id)
  if (accountIds.length === 0) return []

  const rows = await db
    .select({
      date: schema.analyticsSnapshots.date,
      likes: sql<number>`SUM(${schema.analyticsSnapshots.likes})::int`,
      comments: sql<number>`SUM(${schema.analyticsSnapshots.comments})::int`,
      shares: sql<number>`SUM(${schema.analyticsSnapshots.shares})::int`,
      clicks: sql<number>`SUM(${schema.analyticsSnapshots.clicks})::int`,
    })
    .from(schema.analyticsSnapshots)
    .where(
      and(
        inArray(schema.analyticsSnapshots.socialAccountId, accountIds),
        gte(schema.analyticsSnapshots.date, sql`${start.toISOString().slice(0, 10)}`),
        lte(schema.analyticsSnapshots.date, sql`${end.toISOString().slice(0, 10)}`),
        accountFilter(accountId),
      ),
    )
    .groupBy(schema.analyticsSnapshots.date)
    .orderBy(schema.analyticsSnapshots.date)

  return rows.map((r) => ({
    date: r.date,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    shares: r.shares ?? 0,
    clicks: r.clicks ?? 0,
  }))
}

export async function getPlatformTableImpl(
  slug: string,
  range: AnalyticsRange,
  custom: CustomRange = null,
): Promise<PlatformTableRow[]> {
  const { workspace } = await ensureWs(slug)
  const { start, end } = rangeWindow(range, custom)
  const accounts = await db
    .select()
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.workspaceId, workspace.id))

  const out: PlatformTableRow[] = []
  for (const a of accounts) {
    const [agg] = await db
      .select({
        reach: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.reach}),0)::int`,
        impressions: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.impressions}),0)::int`,
        likes: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.likes}),0)::int`,
        comments: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.comments}),0)::int`,
        shares: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.shares}),0)::int`,
        clicks: sql<number>`COALESCE(SUM(${schema.analyticsSnapshots.clicks}),0)::int`,
      })
      .from(schema.analyticsSnapshots)
      .where(
        and(
          eq(schema.analyticsSnapshots.socialAccountId, a.id),
          gte(schema.analyticsSnapshots.date, sql`${start.toISOString().slice(0, 10)}`),
          lte(schema.analyticsSnapshots.date, sql`${end.toISOString().slice(0, 10)}`),
        ),
      )

    const [pp] = await db
      .select({
        posts: sql<number>`COUNT(DISTINCT CASE WHEN ${schema.posts.type} = 'original' THEN ${schema.posts.id} END)::int`,
        reshares: sql<number>`COUNT(DISTINCT CASE WHEN ${schema.posts.type} = 'reshare' THEN ${schema.posts.id} END)::int`,
      })
      .from(schema.postPlatforms)
      .innerJoin(schema.posts, eq(schema.posts.id, schema.postPlatforms.postId))
      .where(
        and(
          eq(schema.postPlatforms.socialAccountId, a.id),
          gte(schema.postPlatforms.publishedAt, start),
          lte(schema.postPlatforms.publishedAt, end),
        ),
      )

    const reach = agg?.reach ?? 0
    const impressions = agg?.impressions ?? 0
    const likes = agg?.likes ?? 0
    const comments = agg?.comments ?? 0
    const shares = agg?.shares ?? 0
    const clicks = agg?.clicks ?? 0
    const engagements = likes + comments + shares + clicks
    out.push({
      accountId: a.id,
      platform: a.platform,
      accountHandle: a.accountHandle,
      accountName: a.accountName,
      posts: pp?.posts ?? 0,
      reshares: pp?.reshares ?? 0,
      reach,
      impressions,
      likes,
      comments,
      shares,
      clicks,
      engagementRate: impressions > 0 ? (engagements / impressions) * 100 : 0,
    })
  }
  return out
}

export async function getTopPostsImpl(
  slug: string,
  range: AnalyticsRange,
  custom: CustomRange = null,
  limit = 5,
): Promise<TopPostRow[]> {
  const { workspace } = await ensureWs(slug)
  const { start, end } = rangeWindow(range, custom)

  // Use analytics_snapshots aggregated by campaignId → post link is indirect.
  // Simpler approach: rank posts by post_platforms.published_at in range and
  // estimate engagement from matching-date analytics_snapshots on that account.
  // For now, rank by a synthetic score of published order within range so we
  // always return something when snapshots are sparse.
  // Pull every post + platform fanout in the window, plus the latest
  // per-post metric snapshot. We pick the *max* snapshot per postPlatform
  // (metrics are cumulative, so the latest row is the truth).
  const rows = await db
    .select({
      id: schema.posts.id,
      content: schema.postVersions.content,
      publishedAt: schema.posts.publishedAt,
      platform: schema.socialAccounts.platform,
      publishedUrl: schema.postPlatforms.publishedUrl,
      postPlatformId: schema.postPlatforms.id,
    })
    .from(schema.posts)
    .leftJoin(schema.postVersions, eq(schema.postVersions.postId, schema.posts.id))
    .leftJoin(schema.postPlatforms, eq(schema.postPlatforms.postId, schema.posts.id))
    .leftJoin(
      schema.socialAccounts,
      eq(schema.socialAccounts.id, schema.postPlatforms.socialAccountId),
    )
    .where(
      and(
        eq(schema.posts.workspaceId, workspace.id),
        gte(schema.posts.publishedAt, start),
        lte(schema.posts.publishedAt, end),
      ),
    )

  const postPlatformIds = rows
    .map((r) => r.postPlatformId)
    .filter((v): v is string => !!v)
  const metricsByPP = new Map<
    string,
    { likes: number; comments: number; shares: number; clicks: number; engagements: number }
  >()
  if (postPlatformIds.length > 0) {
    const metrics = await db
      .select({
        postPlatformId: schema.postMetricsSnapshots.postPlatformId,
        date: schema.postMetricsSnapshots.date,
        likes: schema.postMetricsSnapshots.likes,
        comments: schema.postMetricsSnapshots.comments,
        shares: schema.postMetricsSnapshots.shares,
        clicks: schema.postMetricsSnapshots.clicks,
        engagements: schema.postMetricsSnapshots.engagements,
      })
      .from(schema.postMetricsSnapshots)
      .where(inArray(schema.postMetricsSnapshots.postPlatformId, postPlatformIds))
      .orderBy(desc(schema.postMetricsSnapshots.date))
    for (const m of metrics) {
      if (metricsByPP.has(m.postPlatformId)) continue
      metricsByPP.set(m.postPlatformId, {
        likes: m.likes,
        comments: m.comments,
        shares: m.shares,
        clicks: m.clicks,
        engagements: m.engagements || m.likes + m.comments + m.shares + m.clicks,
      })
    }
  }

  const byPost = new Map<string, TopPostRow>()
  for (const r of rows) {
    const m = r.postPlatformId ? metricsByPP.get(r.postPlatformId) : null
    const existing = byPost.get(r.id)
    if (existing) {
      if (r.platform && !existing.platforms.includes(r.platform as PlatformKey)) {
        existing.platforms.push(r.platform as PlatformKey)
      }
      if (r.publishedUrl && !existing.publishedUrl) existing.publishedUrl = r.publishedUrl
      if (m) {
        existing.likes += m.likes
        existing.comments += m.comments
        existing.shares += m.shares
        existing.clicks += m.clicks
        existing.engagements += m.engagements
      }
    } else {
      byPost.set(r.id, {
        id: r.id,
        content: r.content ?? '',
        platforms: r.platform ? [r.platform as PlatformKey] : [],
        thumbnailUrl: null,
        likes: m?.likes ?? 0,
        comments: m?.comments ?? 0,
        shares: m?.shares ?? 0,
        clicks: m?.clicks ?? 0,
        engagements: m?.engagements ?? 0,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        publishedUrl: r.publishedUrl,
      })
    }
  }
  const ranked = [...byPost.values()].sort((a, b) => b.engagements - a.engagements)
  return ranked.slice(0, limit)
}

export async function getBestPostingTimesImpl(
  slug: string,
  range: AnalyticsRange,
  custom: CustomRange = null,
): Promise<HeatmapRow[]> {
  const { workspace } = await ensureWs(slug)
  const { start, end } = rangeWindow(range, custom)
  const rows = await db
    .select({
      publishedAt: schema.postPlatforms.publishedAt,
      postPlatformId: schema.postPlatforms.id,
    })
    .from(schema.postPlatforms)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.postPlatforms.postId))
    .where(
      and(
        eq(schema.posts.workspaceId, workspace.id),
        gte(schema.postPlatforms.publishedAt, start),
        lte(schema.postPlatforms.publishedAt, end),
      ),
    )

  const ppIds = rows.map((r) => r.postPlatformId)
  const engagementsByPP = new Map<string, number>()
  if (ppIds.length > 0) {
    const metrics = await db
      .select({
        postPlatformId: schema.postMetricsSnapshots.postPlatformId,
        date: schema.postMetricsSnapshots.date,
        engagements: schema.postMetricsSnapshots.engagements,
        likes: schema.postMetricsSnapshots.likes,
        comments: schema.postMetricsSnapshots.comments,
        shares: schema.postMetricsSnapshots.shares,
        clicks: schema.postMetricsSnapshots.clicks,
      })
      .from(schema.postMetricsSnapshots)
      .where(inArray(schema.postMetricsSnapshots.postPlatformId, ppIds))
      .orderBy(desc(schema.postMetricsSnapshots.date))
    for (const m of metrics) {
      if (engagementsByPP.has(m.postPlatformId)) continue
      engagementsByPP.set(
        m.postPlatformId,
        m.engagements || m.likes + m.comments + m.shares + m.clicks,
      )
    }
  }

  const bucket = new Map<string, { posts: number; totalEngagements: number }>()
  for (const r of rows) {
    if (!r.publishedAt) continue
    const d = new Date(r.publishedAt)
    const key = `${d.getDay()}-${d.getHours()}`
    const entry = bucket.get(key) ?? { posts: 0, totalEngagements: 0 }
    entry.posts += 1
    entry.totalEngagements += engagementsByPP.get(r.postPlatformId) ?? 0
    bucket.set(key, entry)
  }
  const out: HeatmapRow[] = []
  for (const [key, val] of bucket) {
    const [d, h] = key.split('-').map(Number) as [number, number]
    out.push({
      dayOfWeek: d,
      hour: h,
      avgEngagements: val.posts > 0 ? val.totalEngagements / val.posts : 0,
      posts: val.posts,
    })
  }
  return out
}

export type AccountOption = {
  id: string
  platform: PlatformKey
  accountHandle: string
  accountName: string
}

export async function listAccountsForAnalyticsImpl(slug: string): Promise<AccountOption[]> {
  const { workspace } = await ensureWs(slug)
  const rows = await db
    .select({
      id: schema.socialAccounts.id,
      platform: schema.socialAccounts.platform,
      accountHandle: schema.socialAccounts.accountHandle,
      accountName: schema.socialAccounts.accountName,
    })
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.workspaceId, workspace.id))
  return rows.map((r) => ({ ...r, platform: r.platform as PlatformKey }))
}
