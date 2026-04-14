import { and, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { decrypt } from '~/lib/encryption'
import { requireWorkspaceAccess } from './session.server'
import type { PlatformKey } from '~/lib/platforms'

export type ReshareSource = {
  sourcePostId: string
  sourcePostUrl: string
  sourceAuthorHandle: string
  sourceAuthorName: string
  sourceContent: string
  sourceMediaUrls: string[]
  postedAt: string | null
  stats: { likes?: number; reposts?: number; replies?: number }
  // Platform-specific metadata kept for publishing (e.g. Bluesky cid).
  // Values are JSON-safe strings so the whole record can cross the wire.
  platformExtra: Record<string, string>
}

export type BrowseResult = {
  kind: 'ok'
  items: ReshareSource[]
} | { kind: 'unsupported'; message: string }

export const RESHARE_PLATFORMS = [
  'x',
  'tumblr',
  'facebook',
  'linkedin',
  'threads',
  'bluesky',
  'mastodon',
  'reddit',
] as const

export type ResharePlatform = (typeof RESHARE_PLATFORMS)[number]

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

async function findAccount(workspaceId: string, platform: PlatformKey) {
  return db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.workspaceId, workspaceId),
      eq(schema.socialAccounts.platform, platform),
      eq(schema.socialAccounts.status, 'connected'),
    ),
  })
}

// ---------- Bluesky ---------------------------------------------------------

const BSKY = 'https://bsky.social'

async function bskyGet<T>(token: string, endpoint: string): Promise<T> {
  const res = await fetch(`${BSKY}/xrpc/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`${endpoint} ${res.status}: ${txt.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

type BskyPost = {
  uri: string
  cid: string
  author: {
    did: string
    handle: string
    displayName?: string
    avatar?: string
  }
  record: { text?: string; createdAt?: string }
  embed?: {
    images?: { fullsize?: string; thumb?: string }[]
    external?: { thumb?: string; uri?: string; title?: string }
  }
  likeCount?: number
  repostCount?: number
  replyCount?: number
}

function mapBskyPost(p: BskyPost): ReshareSource {
  const rkey = p.uri.split('/').pop() ?? ''
  const url = `https://bsky.app/profile/${p.author.did}/post/${rkey}`
  const mediaUrls: string[] = []
  if (p.embed?.images) for (const img of p.embed.images) if (img.fullsize) mediaUrls.push(img.fullsize)
  return {
    sourcePostId: p.uri,
    sourcePostUrl: url,
    sourceAuthorHandle: p.author.handle,
    sourceAuthorName: p.author.displayName || p.author.handle,
    sourceContent: p.record.text ?? '',
    sourceMediaUrls: mediaUrls,
    postedAt: p.record.createdAt ?? null,
    stats: { likes: p.likeCount, reposts: p.repostCount, replies: p.replyCount },
    platformExtra: {
      cid: p.cid,
      authorDid: p.author.did,
      ...(p.author.avatar ? { avatar: p.author.avatar } : {}),
    },
  }
}

async function blueskyBrowse(token: string, handle: string): Promise<BrowseResult> {
  try {
    const data = await bskyGet<{ feed: { post: BskyPost }[] }>(
      token,
      `app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=25`,
    )
    return { kind: 'ok', items: data.feed.map((f) => mapBskyPost(f.post)) }
  } catch (e) {
    return { kind: 'unsupported', message: e instanceof Error ? e.message : 'Bluesky browse failed' }
  }
}

async function blueskySearch(token: string, query: string): Promise<BrowseResult> {
  try {
    const data = await bskyGet<{ posts: BskyPost[] }>(
      token,
      `app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=25`,
    )
    return { kind: 'ok', items: data.posts.map(mapBskyPost) }
  } catch (e) {
    return { kind: 'unsupported', message: e instanceof Error ? e.message : 'Bluesky search failed' }
  }
}

// ---------- Dispatch --------------------------------------------------------

const UNSUPPORTED_MESSAGE: Record<ResharePlatform, string> = {
  x: 'X browse/search requires an X developer app with credentials. Wiring lands when we add a real X publisher.',
  tumblr: 'Tumblr browse/search is wired pending OAuth 1.0a signing.',
  facebook: 'Facebook only supports browsing your own pages — pending real publisher.',
  linkedin: 'LinkedIn API does not expose browsing other accounts. Paste a URL once URL-based reshare lands.',
  threads: 'Threads public browsing is limited; pending real publisher.',
  bluesky: 'Not unsupported — bluesky works.',
  mastodon: 'Mastodon browsing depends on per-instance auth; pending full connection flow.',
  reddit: 'Reddit browse/search lands with the Reddit publisher.',
}

export async function browseAccountImpl(
  slug: string,
  platform: ResharePlatform,
  handle: string,
): Promise<BrowseResult> {
  const { workspace } = await ensureWs(slug)
  if (platform === 'bluesky') {
    const acct = await findAccount(workspace.id, 'bluesky')
    if (!acct) return { kind: 'unsupported', message: 'Connect a Bluesky account first.' }
    return blueskyBrowse(decrypt(acct.accessToken), handle)
  }
  return { kind: 'unsupported', message: UNSUPPORTED_MESSAGE[platform] }
}

export async function searchPostsImpl(
  slug: string,
  platform: ResharePlatform,
  query: string,
  _subreddit: string | null,
): Promise<BrowseResult> {
  const { workspace } = await ensureWs(slug)
  if (platform === 'bluesky') {
    const acct = await findAccount(workspace.id, 'bluesky')
    if (!acct) return { kind: 'unsupported', message: 'Connect a Bluesky account first.' }
    return blueskySearch(decrypt(acct.accessToken), query)
  }
  return { kind: 'unsupported', message: UNSUPPORTED_MESSAGE[platform] }
}

// ---------- Queue reshares --------------------------------------------------

export type QueuedReshareInput = {
  workspaceSlug: string
  targetSocialAccountId: string
  platform: ResharePlatform
  scheduledAt: string | null
  items: Array<{
    sourcePostId: string
    sourcePostUrl: string
    sourceAuthorHandle: string
    sourceAuthorName: string
    sourceContent: string
    sourceMediaUrls: string[]
    reshareType: 'repost' | 'quote' | 'reblog' | 'boost' | 'crosspost' | 'share'
    quoteComment: string | null
    targetSubreddit: string | null
    platformExtra?: Record<string, string>
  }>
}

export async function queueResharesImpl(input: QueuedReshareInput) {
  const { workspace, user } = await ensureWs(input.workspaceSlug)

  const acct = await db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.id, input.targetSocialAccountId),
      eq(schema.socialAccounts.workspaceId, workspace.id),
    ),
  })
  if (!acct) throw new Error('Target account not found')
  if (acct.platform !== input.platform) {
    throw new Error('Target account does not match selected platform')
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null
  const scheduled = scheduledAt && scheduledAt.getTime() > Date.now()

  const createdIds: string[] = []

  for (const item of input.items) {
    await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(schema.posts)
        .values({
          workspaceId: workspace.id,
          authorId: user.id,
          type: 'reshare',
          status: scheduled ? 'scheduled' : 'draft',
          scheduledAt: scheduled ? scheduledAt : null,
          isQueue: !scheduled,
        })
        .returning({ id: schema.posts.id })
      if (!post) throw new Error('Failed to create post')

      await tx.insert(schema.postReshareDetails).values({
        postId: post.id,
        sourcePlatform: input.platform,
        sourcePostId: item.sourcePostId,
        sourcePostUrl: item.sourcePostUrl,
        sourceAuthorHandle: item.sourceAuthorHandle,
        sourceAuthorName: item.sourceAuthorName,
        sourceContent: item.sourceContent,
        sourceMediaUrls: item.sourceMediaUrls,
        reshareType: item.reshareType,
        quoteComment: item.quoteComment,
        targetSubreddit: item.targetSubreddit,
      })

      // Store platform extras (e.g. cid for Bluesky) on an empty version
      await tx.insert(schema.postVersions).values({
        postId: post.id,
        platforms: [input.platform],
        content: item.quoteComment ?? '',
        isDefault: true,
        platformVariables: (item.platformExtra ?? {}) as Record<string, string>,
      })

      await tx.insert(schema.postPlatforms).values({
        postId: post.id,
        socialAccountId: acct.id,
        status: 'pending',
      })

      await tx.insert(schema.postActivity).values({
        postId: post.id,
        userId: user.id,
        action: 'reshared',
      })

      createdIds.push(post.id)
    })
  }

  return { count: createdIds.length, postIds: createdIds }
}
