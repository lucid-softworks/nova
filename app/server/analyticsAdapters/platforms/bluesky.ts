import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

const PLC_DIRECTORY = 'https://plc.directory'

async function resolvePds(did: string): Promise<string> {
  const res = await fetch(`${PLC_DIRECTORY}/${encodeURIComponent(did)}`)
  if (!res.ok) return 'https://bsky.social'
  const doc = (await res.json()) as {
    service?: Array<{ id: string; serviceEndpoint: string }>
  }
  const pds = doc.service?.find((s) => s.id === '#atproto_pds')
  return pds?.serviceEndpoint?.replace(/\/+$/, '') ?? 'https://bsky.social'
}

async function xrpc<T>(
  pdsUrl: string,
  nsid: string,
  token: string,
  params: Record<string, string>,
): Promise<T | null> {
  const url = new URL(`${pdsUrl}/xrpc/${nsid}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return (await res.json()) as T
}

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const did = (ctx.metadata.did as string) ?? ctx.accountHandle
  const pdsUrl = await resolvePds(did)
  type ProfileResponse = { followersCount?: number; followsCount?: number; postsCount?: number }
  const profile = await xrpc<ProfileResponse>(pdsUrl, 'app.bsky.actor.getProfile', ctx.accessToken, {
    actor: did,
  })
  if (!profile) return {}
  return {
    followers: profile.followersCount ?? 0,
    following: profile.followsCount ?? 0,
    posts: profile.postsCount ?? 0,
  }
}

export async function syncPosts(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]> {
  if (ctx.platformPostIds.length === 0) return []
  const did = (ctx.metadata.did as string) ?? ctx.accountHandle
  const pdsUrl = await resolvePds(did)
  type PostView = {
    uri: string
    likeCount?: number
    repostCount?: number
    replyCount?: number
  }
  type PostsResponse = { posts?: PostView[] }
  const out: PostSnapshot[] = []
  for (let i = 0; i < ctx.platformPostIds.length; i += 25) {
    const batch = ctx.platformPostIds.slice(i, i + 25)
    const url = new URL(`${pdsUrl}/xrpc/app.bsky.feed.getPosts`)
    for (const uri of batch) url.searchParams.append('uris', uri)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    })
    if (!res.ok) continue
    const json = (await res.json()) as PostsResponse
    for (const p of json.posts ?? []) {
      out.push({
        platformPostId: p.uri,
        likes: p.likeCount ?? 0,
        shares: p.repostCount ?? 0,
        comments: p.replyCount ?? 0,
        engagements: (p.likeCount ?? 0) + (p.repostCount ?? 0) + (p.replyCount ?? 0),
      })
    }
  }
  return out
}
