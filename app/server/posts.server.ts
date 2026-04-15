import { and, asc, desc, eq, gte, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import type { PlatformKey } from '~/lib/platforms'
import type {
  PostsTab,
  PostRow,
  CountsByStatus,
  CampaignSummary,
  CampaignDetail,
} from './posts-types'

export type { PostsTab, PostRow, CountsByStatus, CampaignSummary, CampaignDetail }

export type PostListQuery = {
  workspaceSlug: string
  tab: PostsTab
  search: string | null
  platforms: PlatformKey[]
  type: 'all' | 'original' | 'reshare'
  authorId: string | null
  fromIso: string | null
  toIso: string | null
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

// --------------------------------------------------------------------------

export async function listPostsImpl(q: PostListQuery): Promise<PostRow[]> {
  const { workspace } = await ensureWs(q.workspaceSlug)
  const wsFilter = eq(schema.posts.workspaceId, workspace.id)

  const statusFilter = tabToStatusFilter(q.tab)
  const typeFilter =
    q.type === 'all'
      ? undefined
      : q.type === 'original'
        ? eq(schema.posts.type, 'original')
        : eq(schema.posts.type, 'reshare')
  const authorFilter = q.authorId ? eq(schema.posts.authorId, q.authorId) : undefined

  const dateColumn = q.tab === 'published' ? schema.posts.publishedAt : schema.posts.scheduledAt
  const fromFilter = q.fromIso ? gte(dateColumn, new Date(q.fromIso)) : undefined
  const toFilter = q.toIso ? lte(dateColumn, new Date(q.toIso)) : undefined

  // Search: content (from any post_version) or reshare source handle
  const searchFilter = q.search
    ? sql`EXISTS (
        SELECT 1 FROM ${schema.postVersions}
         WHERE ${schema.postVersions.postId} = ${schema.posts.id}
           AND ${schema.postVersions.content} ILIKE ${`%${q.search}%`}
      ) OR EXISTS (
        SELECT 1 FROM ${schema.postReshareDetails}
         WHERE ${schema.postReshareDetails.postId} = ${schema.posts.id}
           AND ${schema.postReshareDetails.sourceAuthorHandle} ILIKE ${`%${q.search}%`}
      )`
    : undefined

  // Platform filter: post targets any of the selected platforms
  const platformFilter = q.platforms.length
    ? sql`EXISTS (
        SELECT 1 FROM ${schema.postPlatforms}
          INNER JOIN ${schema.socialAccounts}
            ON ${schema.socialAccounts.id} = ${schema.postPlatforms.socialAccountId}
         WHERE ${schema.postPlatforms.postId} = ${schema.posts.id}
           AND ${schema.socialAccounts.platform} IN (${sql.join(
             q.platforms.map((p) => sql`${p}`),
             sql`, `,
           )})
      )`
    : undefined

  const orderBy =
    q.tab === 'published' ? desc(schema.posts.publishedAt) : desc(schema.posts.updatedAt)

  const where = and(
    wsFilter,
    statusFilter,
    typeFilter,
    authorFilter,
    fromFilter,
    toFilter,
    searchFilter,
    platformFilter,
  )

  const postRows = await db
    .select({
      id: schema.posts.id,
      type: schema.posts.type,
      status: schema.posts.status,
      scheduledAt: schema.posts.scheduledAt,
      publishedAt: schema.posts.publishedAt,
      createdAt: schema.posts.createdAt,
      updatedAt: schema.posts.updatedAt,
      failureReason: schema.posts.failureReason,
      isQueue: schema.posts.isQueue,
      authorName: schema.user.name,
      authorId: schema.posts.authorId,
      campaignId: schema.posts.campaignId,
      campaignName: schema.campaigns.name,
      campaignStepOrder: schema.campaignSteps.stepOrder,
    })
    .from(schema.posts)
    .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
    .leftJoin(schema.campaigns, eq(schema.campaigns.id, schema.posts.campaignId))
    .leftJoin(schema.campaignSteps, eq(schema.campaignSteps.postId, schema.posts.id))
    .where(where)
    .orderBy(orderBy)
    .limit(200)

  if (postRows.length === 0) return []

  const postIds = postRows.map((r) => r.id)

  const versions = await db
    .select()
    .from(schema.postVersions)
    .where(inArray(schema.postVersions.postId, postIds))

  const platformTargets = await db
    .select({
      postId: schema.postPlatforms.postId,
      socialAccountId: schema.postPlatforms.socialAccountId,
      platform: schema.socialAccounts.platform,
      accountHandle: schema.socialAccounts.accountHandle,
      status: schema.postPlatforms.status,
      publishedUrl: schema.postPlatforms.publishedUrl,
    })
    .from(schema.postPlatforms)
    .innerJoin(
      schema.socialAccounts,
      eq(schema.socialAccounts.id, schema.postPlatforms.socialAccountId),
    )
    .where(inArray(schema.postPlatforms.postId, postIds))

  const reshareDetails = await db
    .select()
    .from(schema.postReshareDetails)
    .where(inArray(schema.postReshareDetails.postId, postIds))

  // First media per post (default version preferred, fallback first version)
  const firstMedia = await db
    .select({
      postId: schema.postVersions.postId,
      mediaId: schema.postMedia.mediaId,
      url: schema.mediaAssets.url,
      mimeType: schema.mediaAssets.mimeType,
      sortOrder: schema.postMedia.sortOrder,
      isDefault: schema.postVersions.isDefault,
    })
    .from(schema.postMedia)
    .innerJoin(schema.postVersions, eq(schema.postVersions.id, schema.postMedia.postVersionId))
    .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
    .where(inArray(schema.postVersions.postId, postIds))
    .orderBy(asc(schema.postMedia.sortOrder))

  const versionsByPost = groupBy(versions, (v) => v.postId)
  const targetsByPost = groupBy(platformTargets, (t) => t.postId)
  const mediaByPost = groupBy(firstMedia, (m) => m.postId)
  const reshareByPost = new Map(reshareDetails.map((r) => [r.postId, r]))

  return postRows.map((r): PostRow => {
    const vs = versionsByPost.get(r.id) ?? []
    const defaultV = vs.find((v) => v.isDefault) ?? vs[0]
    const media = (mediaByPost.get(r.id) ?? []).sort((a, b) => {
      const aDefault = a.isDefault ? 0 : 1
      const bDefault = b.isDefault ? 0 : 1
      return aDefault - bDefault || a.sortOrder - b.sortOrder
    })
    const first = media[0] ?? null
    const reshare = reshareByPost.get(r.id)
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      failureReason: r.failureReason,
      isQueue: r.isQueue,
      authorName: r.authorName,
      authorId: r.authorId,
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      campaignStepOrder: r.campaignStepOrder,
      versionCount: vs.length,
      defaultContent: defaultV?.content ?? '',
      firstMediaUrl: first?.url ?? null,
      firstMediaMime: first?.mimeType ?? null,
      platforms: (targetsByPost.get(r.id) ?? []).map((t) => ({
        socialAccountId: t.socialAccountId,
        platform: t.platform as PlatformKey,
        accountHandle: t.accountHandle,
        status: t.status,
        publishedUrl: t.publishedUrl,
      })),
      reshareSource: reshare
        ? {
            platform: reshare.sourcePlatform as PlatformKey,
            authorHandle: reshare.sourceAuthorHandle,
            preview: reshare.sourceContent.slice(0, 200),
          }
        : null,
    }
  })
}

function tabToStatusFilter(tab: PostsTab) {
  switch (tab) {
    case 'all':
      return undefined
    case 'scheduled':
      return and(
        inArray(schema.posts.status, ['scheduled', 'publishing'] as const),
        eq(schema.posts.isQueue, false),
      )
    case 'published':
      return eq(schema.posts.status, 'published')
    case 'drafts':
      return eq(schema.posts.status, 'draft')
    case 'pending_approval':
      return eq(schema.posts.status, 'pending_approval')
    case 'failed':
      return eq(schema.posts.status, 'failed')
    case 'queue':
      return and(
        eq(schema.posts.isQueue, true),
        isNotNull(schema.posts.scheduledAt),
      )
  }
}

export async function countsByStatusImpl(slug: string): Promise<CountsByStatus> {
  const { workspace } = await ensureWs(slug)
  const rows = await db
    .select({ status: schema.posts.status, isQueue: schema.posts.isQueue, n: sql<number>`count(*)::int` })
    .from(schema.posts)
    .where(eq(schema.posts.workspaceId, workspace.id))
    .groupBy(schema.posts.status, schema.posts.isQueue)

  const counts: CountsByStatus = {
    all: 0,
    scheduled: 0,
    published: 0,
    drafts: 0,
    pending_approval: 0,
    failed: 0,
    queue: 0,
  }
  for (const r of rows) {
    counts.all += r.n
    if (r.status === 'published') counts.published += r.n
    if (r.status === 'draft') counts.drafts += r.n
    if (r.status === 'pending_approval') counts.pending_approval += r.n
    if (r.status === 'failed') counts.failed += r.n
    if (r.status === 'scheduled' || r.status === 'publishing') {
      if (r.isQueue) counts.queue += r.n
      else counts.scheduled += r.n
    }
  }
  return counts
}

// --------------------------------------------------------------------------
// Calendar query: posts scheduled OR published within a date range.

export async function listPostsForCalendarImpl(
  slug: string,
  fromIso: string,
  toIso: string,
): Promise<PostRow[]> {
  const { workspace } = await ensureWs(slug)
  const fromDate = new Date(fromIso)
  const toDate = new Date(toIso)

  const postRows = await db
    .select({
      id: schema.posts.id,
      type: schema.posts.type,
      status: schema.posts.status,
      scheduledAt: schema.posts.scheduledAt,
      publishedAt: schema.posts.publishedAt,
      createdAt: schema.posts.createdAt,
      updatedAt: schema.posts.updatedAt,
      failureReason: schema.posts.failureReason,
      isQueue: schema.posts.isQueue,
      authorName: schema.user.name,
      authorId: schema.posts.authorId,
      campaignId: schema.posts.campaignId,
      campaignName: schema.campaigns.name,
      campaignStepOrder: schema.campaignSteps.stepOrder,
    })
    .from(schema.posts)
    .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
    .leftJoin(schema.campaigns, eq(schema.campaigns.id, schema.posts.campaignId))
    .leftJoin(schema.campaignSteps, eq(schema.campaignSteps.postId, schema.posts.id))
    .where(
      and(
        eq(schema.posts.workspaceId, workspace.id),
        or(
          and(
            isNotNull(schema.posts.scheduledAt),
            gte(schema.posts.scheduledAt, fromDate),
            lte(schema.posts.scheduledAt, toDate),
          ),
          and(
            isNotNull(schema.posts.publishedAt),
            gte(schema.posts.publishedAt, fromDate),
            lte(schema.posts.publishedAt, toDate),
          ),
        ),
      ),
    )
    .orderBy(asc(sql`COALESCE(${schema.posts.publishedAt}, ${schema.posts.scheduledAt})`))
    .limit(500)

  return hydratePostRows(postRows)
}

type PostBase = {
  id: string
  type: 'original' | 'reshare'
  status: PostRow['status']
  scheduledAt: Date | null
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  failureReason: string | null
  isQueue: boolean
  authorName: string | null
  authorId: string | null
  campaignId: string | null
  campaignName: string | null
  campaignStepOrder: number | null
}

async function hydratePostRows(postRows: PostBase[]): Promise<PostRow[]> {
  if (postRows.length === 0) return []
  const postIds = postRows.map((r) => r.id)

  const versions = await db
    .select()
    .from(schema.postVersions)
    .where(inArray(schema.postVersions.postId, postIds))

  const platformTargets = await db
    .select({
      postId: schema.postPlatforms.postId,
      socialAccountId: schema.postPlatforms.socialAccountId,
      platform: schema.socialAccounts.platform,
      accountHandle: schema.socialAccounts.accountHandle,
      status: schema.postPlatforms.status,
      publishedUrl: schema.postPlatforms.publishedUrl,
    })
    .from(schema.postPlatforms)
    .innerJoin(
      schema.socialAccounts,
      eq(schema.socialAccounts.id, schema.postPlatforms.socialAccountId),
    )
    .where(inArray(schema.postPlatforms.postId, postIds))

  const reshareDetails = await db
    .select()
    .from(schema.postReshareDetails)
    .where(inArray(schema.postReshareDetails.postId, postIds))

  const firstMedia = await db
    .select({
      postId: schema.postVersions.postId,
      mediaId: schema.postMedia.mediaId,
      url: schema.mediaAssets.url,
      mimeType: schema.mediaAssets.mimeType,
      sortOrder: schema.postMedia.sortOrder,
      isDefault: schema.postVersions.isDefault,
    })
    .from(schema.postMedia)
    .innerJoin(schema.postVersions, eq(schema.postVersions.id, schema.postMedia.postVersionId))
    .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
    .where(inArray(schema.postVersions.postId, postIds))
    .orderBy(asc(schema.postMedia.sortOrder))

  const versionsByPost = groupBy(versions, (v) => v.postId)
  const targetsByPost = groupBy(platformTargets, (t) => t.postId)
  const mediaByPost = groupBy(firstMedia, (m) => m.postId)
  const reshareByPost = new Map(reshareDetails.map((r) => [r.postId, r]))

  return postRows.map((r): PostRow => {
    const vs = versionsByPost.get(r.id) ?? []
    const defaultV = vs.find((v) => v.isDefault) ?? vs[0]
    const media = (mediaByPost.get(r.id) ?? []).sort((a, b) => {
      const aDefault = a.isDefault ? 0 : 1
      const bDefault = b.isDefault ? 0 : 1
      return aDefault - bDefault || a.sortOrder - b.sortOrder
    })
    const first = media[0] ?? null
    const reshare = reshareByPost.get(r.id)
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      failureReason: r.failureReason,
      isQueue: r.isQueue,
      authorName: r.authorName,
      authorId: r.authorId,
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      campaignStepOrder: r.campaignStepOrder,
      versionCount: vs.length,
      defaultContent: defaultV?.content ?? '',
      firstMediaUrl: first?.url ?? null,
      firstMediaMime: first?.mimeType ?? null,
      platforms: (targetsByPost.get(r.id) ?? []).map((t) => ({
        socialAccountId: t.socialAccountId,
        platform: t.platform as PlatformKey,
        accountHandle: t.accountHandle,
        status: t.status,
        publishedUrl: t.publishedUrl,
      })),
      reshareSource: reshare
        ? {
            platform: reshare.sourcePlatform as PlatformKey,
            authorHandle: reshare.sourceAuthorHandle,
            preview: reshare.sourceContent.slice(0, 200),
          }
        : null,
    }
  })
}

// --------------------------------------------------------------------------
// Campaign-aware grouped list: returns campaigns (for the grouped view) +
// standalone posts. Each campaign includes its steps with post rows.

export async function listCampaignsImpl(slug: string): Promise<CampaignSummary[]> {
  const { workspace } = await ensureWs(slug)
  const campaigns = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.workspaceId, workspace.id))
    .orderBy(desc(schema.campaigns.updatedAt))

  if (campaigns.length === 0) return []

  const ids = campaigns.map((c) => c.id)
  const steps = await db
    .select()
    .from(schema.campaignSteps)
    .where(inArray(schema.campaignSteps.campaignId, ids))
    .orderBy(asc(schema.campaignSteps.stepOrder))

  const postIds = steps.map((s) => s.postId).filter(Boolean) as string[]
  const postRowById = new Map<string, PostRow>()
  if (postIds.length > 0) {
    const rows = await listPostsImpl({
      workspaceSlug: slug,
      tab: 'all',
      search: null,
      platforms: [],
      type: 'all',
      authorId: null,
      fromIso: null,
      toIso: null,
    })
    for (const r of rows) postRowById.set(r.id, r)
  }

  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    updatedAt: c.updatedAt.toISOString(),
    steps: steps
      .filter((s) => s.campaignId === c.id)
      .map((s) => ({
        id: s.id,
        stepOrder: s.stepOrder,
        status: s.status,
        triggerType: s.triggerType,
        triggerDelayMinutes: s.triggerDelayMinutes,
        triggerScheduledAt: s.triggerScheduledAt?.toISOString() ?? null,
        dependsOnStepId: s.dependsOnStepId,
        post: s.postId ? postRowById.get(s.postId) ?? null : null,
      })),
  }))
}

// --------------------------------------------------------------------------
// Actions

export async function deletePostsImpl(slug: string, postIds: string[]) {
  if (postIds.length === 0) return { ok: true }
  const { workspace } = await ensureWs(slug)
  await db
    .delete(schema.posts)
    .where(
      and(eq(schema.posts.workspaceId, workspace.id), inArray(schema.posts.id, postIds)),
    )
  return { ok: true }
}

export async function duplicatePostImpl(slug: string, postId: string) {
  const { workspace, user } = await ensureWs(slug)
  const source = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.workspaceId, workspace.id)),
  })
  if (!source) throw new Error('Post not found')

  const versions = await db
    .select()
    .from(schema.postVersions)
    .where(eq(schema.postVersions.postId, postId))

  const targets = await db
    .select()
    .from(schema.postPlatforms)
    .where(eq(schema.postPlatforms.postId, postId))

  const newId = await db.transaction(async (tx) => {
    const [newPost] = await tx
      .insert(schema.posts)
      .values({
        workspaceId: workspace.id,
        authorId: user.id,
        type: source.type,
        status: 'draft',
        labels: source.labels,
      })
      .returning({ id: schema.posts.id })
    if (!newPost) throw new Error('Failed to duplicate post')

    for (const v of versions) {
      const [newV] = await tx
        .insert(schema.postVersions)
        .values({
          postId: newPost.id,
          platforms: v.platforms,
          content: v.content,
          firstComment: v.firstComment,
          isThread: v.isThread,
          threadParts: v.threadParts ?? [],
          isDefault: v.isDefault,
          platformVariables: {},
        })
        .returning({ id: schema.postVersions.id })
      if (!newV) continue
      const media = await tx
        .select()
        .from(schema.postMedia)
        .where(eq(schema.postMedia.postVersionId, v.id))
      for (const m of media) {
        await tx.insert(schema.postMedia).values({
          postVersionId: newV.id,
          mediaId: m.mediaId,
          sortOrder: m.sortOrder,
        })
      }
    }

    for (const t of targets) {
      await tx.insert(schema.postPlatforms).values({
        postId: newPost.id,
        socialAccountId: t.socialAccountId,
        status: 'pending',
      })
    }

    if (source.type === 'reshare') {
      const detail = await tx.query.postReshareDetails.findFirst({
        where: eq(schema.postReshareDetails.postId, postId),
      })
      if (detail) {
        await tx.insert(schema.postReshareDetails).values({
          postId: newPost.id,
          sourcePlatform: detail.sourcePlatform,
          sourcePostId: detail.sourcePostId,
          sourcePostUrl: detail.sourcePostUrl,
          sourceAuthorHandle: detail.sourceAuthorHandle,
          sourceAuthorName: detail.sourceAuthorName,
          sourceContent: detail.sourceContent,
          sourceMediaUrls: detail.sourceMediaUrls,
          reshareType: detail.reshareType,
          quoteComment: detail.quoteComment,
          targetSubreddit: detail.targetSubreddit,
        })
      }
    }

    await tx.insert(schema.postActivity).values({
      postId: newPost.id,
      userId: user.id,
      action: 'created',
      note: 'duplicated',
    })
    return newPost.id
  })
  return { postId: newId }
}

export async function retryPostImpl(slug: string, postId: string) {
  const { workspace } = await ensureWs(slug)
  await db
    .update(schema.posts)
    .set({
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 5_000),
      failedAt: null,
      failureReason: null,
    })
    .where(and(eq(schema.posts.id, postId), eq(schema.posts.workspaceId, workspace.id)))
  await db
    .update(schema.postPlatforms)
    .set({ status: 'pending', failureReason: null })
    .where(eq(schema.postPlatforms.postId, postId))
  return { ok: true }
}

export async function changeToDraftImpl(slug: string, postIds: string[]) {
  if (postIds.length === 0) return { ok: true }
  const { workspace } = await ensureWs(slug)
  await db
    .update(schema.posts)
    .set({ status: 'draft', scheduledAt: null, isQueue: false })
    .where(
      and(eq(schema.posts.workspaceId, workspace.id), inArray(schema.posts.id, postIds)),
    )
  return { ok: true }
}

// Campaign analytics rollup

export type CampaignAnalytics = {
  totals: {
    reach: number
    impressions: number
    engagements: number
    likes: number
    comments: number
    shares: number
    clicks: number
    publishedSteps: number
    totalSteps: number
  }
  byPlatform: Array<{
    platform: PlatformKey
    reach: number
    impressions: number
    engagements: number
    engagementRate: number
    posts: number
  }>
}

export async function getCampaignAnalyticsImpl(
  slug: string,
  campaignId: string,
): Promise<CampaignAnalytics | null> {
  const { workspace } = await ensureWs(slug)
  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(schema.campaigns.id, campaignId),
      eq(schema.campaigns.workspaceId, workspace.id),
    ),
  })
  if (!campaign) return null

  const steps = await db
    .select({ status: schema.campaignSteps.status })
    .from(schema.campaignSteps)
    .where(eq(schema.campaignSteps.campaignId, campaignId))

  const snaps = await db
    .select({
      platform: schema.socialAccounts.platform,
      reach: schema.analyticsSnapshots.reach,
      impressions: schema.analyticsSnapshots.impressions,
      engagements: schema.analyticsSnapshots.engagements,
      likes: schema.analyticsSnapshots.likes,
      comments: schema.analyticsSnapshots.comments,
      shares: schema.analyticsSnapshots.shares,
      clicks: schema.analyticsSnapshots.clicks,
      posts: schema.analyticsSnapshots.posts,
    })
    .from(schema.analyticsSnapshots)
    .innerJoin(
      schema.socialAccounts,
      eq(schema.socialAccounts.id, schema.analyticsSnapshots.socialAccountId),
    )
    .where(eq(schema.analyticsSnapshots.campaignId, campaignId))

  const totals = {
    reach: 0,
    impressions: 0,
    engagements: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    clicks: 0,
    publishedSteps: steps.filter((s) => s.status === 'published').length,
    totalSteps: steps.length,
  }
  const byPlatform = new Map<
    PlatformKey,
    { reach: number; impressions: number; engagements: number; posts: number }
  >()
  for (const s of snaps) {
    totals.reach += s.reach
    totals.impressions += s.impressions
    totals.engagements += s.engagements
    totals.likes += s.likes
    totals.comments += s.comments
    totals.shares += s.shares
    totals.clicks += s.clicks
    const key = s.platform as PlatformKey
    const cur = byPlatform.get(key) ?? { reach: 0, impressions: 0, engagements: 0, posts: 0 }
    cur.reach += s.reach
    cur.impressions += s.impressions
    cur.engagements += s.engagements
    cur.posts += s.posts
    byPlatform.set(key, cur)
  }

  return {
    totals,
    byPlatform: [...byPlatform.entries()].map(([platform, v]) => ({
      platform,
      reach: v.reach,
      impressions: v.impressions,
      engagements: v.engagements,
      engagementRate: v.reach > 0 ? v.engagements / v.reach : 0,
      posts: v.posts,
    })),
  }
}

// Activity timeline

export type WorkspaceActivityRow = {
  id: string
  postId: string
  action: (typeof schema.postActivityEnum.enumValues)[number]
  note: string | null
  createdAt: string
  userName: string | null
  postContent: string | null
}

export async function listWorkspaceActivityImpl(
  slug: string,
  limit = 100,
): Promise<WorkspaceActivityRow[]> {
  const { workspace } = await ensureWs(slug)
  const rows = await db
    .select({
      id: schema.postActivity.id,
      postId: schema.postActivity.postId,
      action: schema.postActivity.action,
      note: schema.postActivity.note,
      createdAt: schema.postActivity.createdAt,
      userName: schema.user.name,
      postContent: schema.postVersions.content,
    })
    .from(schema.postActivity)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.postActivity.postId))
    .leftJoin(schema.user, eq(schema.user.id, schema.postActivity.userId))
    .leftJoin(schema.postVersions, eq(schema.postVersions.postId, schema.posts.id))
    .where(eq(schema.posts.workspaceId, workspace.id))
    .orderBy(desc(schema.postActivity.createdAt))
    .limit(limit)

  const seen = new Set<string>()
  const out: WorkspaceActivityRow[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push({
      id: r.id,
      postId: r.postId,
      action: r.action,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      userName: r.userName,
      postContent: r.postContent ? r.postContent.slice(0, 120) : null,
    })
  }
  return out
}

export type PostActivityRow = {
  id: string
  action: (typeof schema.postActivityEnum.enumValues)[number]
  note: string | null
  createdAt: string
  userName: string | null
}

export async function listPostActivityImpl(
  slug: string,
  postId: string,
): Promise<PostActivityRow[]> {
  const { workspace } = await ensureWs(slug)
  const post = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.workspaceId, workspace.id)),
    columns: { id: true },
  })
  if (!post) return []
  const rows = await db
    .select({
      id: schema.postActivity.id,
      action: schema.postActivity.action,
      note: schema.postActivity.note,
      createdAt: schema.postActivity.createdAt,
      userName: schema.user.name,
    })
    .from(schema.postActivity)
    .leftJoin(schema.user, eq(schema.user.id, schema.postActivity.userId))
    .where(eq(schema.postActivity.postId, postId))
    .orderBy(asc(schema.postActivity.createdAt))
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    userName: r.userName,
  }))
}

// Campaign actions

async function setActiveStepsTo(
  campaignId: string,
  campaignStatus: 'paused' | 'cancelled',
  stepStatus: 'waiting' | 'failed',
) {
  const steps = await db
    .select()
    .from(schema.campaignSteps)
    .where(eq(schema.campaignSteps.campaignId, campaignId))
  const activeSteps = steps.filter(
    (s) => s.status !== 'published' && s.status !== 'failed',
  )
  if (activeSteps.length > 0) {
    await db
      .update(schema.campaignSteps)
      .set({ status: stepStatus })
      .where(
        inArray(
          schema.campaignSteps.id,
          activeSteps.map((s) => s.id),
        ),
      )
    const postIds = activeSteps.map((s) => s.postId).filter(Boolean) as string[]
    if (postIds.length > 0) {
      await db
        .update(schema.posts)
        .set({ status: 'draft', scheduledAt: null })
        .where(inArray(schema.posts.id, postIds))
    }
  }
  await db
    .update(schema.campaigns)
    .set({ status: campaignStatus, updatedAt: new Date() })
    .where(eq(schema.campaigns.id, campaignId))
}

export async function pauseCampaignImpl(slug: string, campaignId: string) {
  const { workspace } = await ensureWs(slug)
  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(schema.campaigns.id, campaignId),
      eq(schema.campaigns.workspaceId, workspace.id),
    ),
  })
  if (!campaign) throw new Error('Campaign not found')
  await setActiveStepsTo(campaignId, 'paused', 'waiting')
  return { ok: true }
}

export async function cancelCampaignImpl(slug: string, campaignId: string) {
  const { workspace } = await ensureWs(slug)
  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(schema.campaigns.id, campaignId),
      eq(schema.campaigns.workspaceId, workspace.id),
    ),
  })
  if (!campaign) throw new Error('Campaign not found')
  await setActiveStepsTo(campaignId, 'cancelled', 'failed')
  return { ok: true }
}

export async function skipCampaignStepImpl(slug: string, stepId: string) {
  const { workspace } = await ensureWs(slug)
  const step = await db.query.campaignSteps.findFirst({
    where: eq(schema.campaignSteps.id, stepId),
  })
  if (!step) throw new Error('Step not found')
  const campaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, step.campaignId),
  })
  if (!campaign || campaign.workspaceId !== workspace.id) {
    throw new Error('Step not found')
  }
  const { skipStep } = await import('./queues/campaignWorker')
  await skipStep(stepId)
  return { ok: true }
}

export async function triggerCampaignStepNowImpl(slug: string, stepId: string) {
  const { workspace } = await ensureWs(slug)
  const step = await db.query.campaignSteps.findFirst({
    where: eq(schema.campaignSteps.id, stepId),
  })
  if (!step) throw new Error('Step not found')
  const campaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, step.campaignId),
  })
  if (!campaign || campaign.workspaceId !== workspace.id) {
    throw new Error('Step not found')
  }
  const { triggerStepNow } = await import('./queues/campaignWorker')
  await triggerStepNow(stepId)
  return { ok: true }
}

export async function duplicateCampaignImpl(slug: string, campaignId: string) {
  const { workspace, user } = await ensureWs(slug)
  const source = await db.query.campaigns.findFirst({
    where: and(
      eq(schema.campaigns.id, campaignId),
      eq(schema.campaigns.workspaceId, workspace.id),
    ),
  })
  if (!source) throw new Error('Campaign not found')

  const steps = await db
    .select()
    .from(schema.campaignSteps)
    .where(eq(schema.campaignSteps.campaignId, campaignId))
    .orderBy(asc(schema.campaignSteps.stepOrder))

  const [newCampaign] = await db
    .insert(schema.campaigns)
    .values({
      workspaceId: workspace.id,
      authorId: user.id,
      name: `${source.name} (copy)`,
      status: 'draft',
    })
    .returning({ id: schema.campaigns.id })
  if (!newCampaign) throw new Error('Failed to duplicate campaign')

  // Duplicate each step's post (as draft) and rebuild dependency links with
  // the new step ids.
  const oldToNewStep = new Map<string, string>()
  for (const s of steps) {
    let newPostId: string | null = null
    if (s.postId) {
      const dup = await duplicatePostImpl(slug, s.postId)
      newPostId = dup.postId
      await db
        .update(schema.posts)
        .set({ campaignId: newCampaign.id })
        .where(eq(schema.posts.id, dup.postId))
    }
    const [newStep] = await db
      .insert(schema.campaignSteps)
      .values({
        campaignId: newCampaign.id,
        postId: newPostId,
        stepOrder: s.stepOrder,
        status: 'waiting',
        triggerType: s.triggerType,
        triggerDelayMinutes: s.triggerDelayMinutes,
        triggerScheduledAt: null,
        dependsOnStepId: null,
      })
      .returning({ id: schema.campaignSteps.id })
    if (newStep) oldToNewStep.set(s.id, newStep.id)
  }
  for (const s of steps) {
    if (!s.dependsOnStepId) continue
    const newId = oldToNewStep.get(s.id)
    const newDep = oldToNewStep.get(s.dependsOnStepId)
    if (!newId || !newDep) continue
    await db
      .update(schema.campaignSteps)
      .set({ dependsOnStepId: newDep })
      .where(eq(schema.campaignSteps.id, newId))
  }

  return { campaignId: newCampaign.id }
}

// Campaign detail

export async function getCampaignDetailImpl(
  slug: string,
  campaignId: string,
): Promise<CampaignDetail | null> {
  const { workspace } = await ensureWs(slug)
  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(schema.campaigns.id, campaignId),
      eq(schema.campaigns.workspaceId, workspace.id),
    ),
  })
  if (!campaign) return null
  const all = await listCampaignsImpl(slug)
  const summary = all.find((c) => c.id === campaignId)
  if (!summary) return null
  return {
    ...summary,
    stepsWithPlatforms: summary.steps.map((s) => ({
      ...s,
      publishedUrls:
        s.post?.platforms.filter((p) => p.publishedUrl).map((p) => p.publishedUrl!) ?? [],
    })),
  }
}

// Helpers

function groupBy<T, K extends string | number>(list: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of list) {
    const k = key(item)
    const arr = out.get(k)
    if (arr) arr.push(item)
    else out.set(k, [item])
  }
  return out
}
