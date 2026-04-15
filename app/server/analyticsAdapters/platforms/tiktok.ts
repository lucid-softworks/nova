import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

const API = 'https://open.tiktokapis.com/v2'

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const url = new URL(`${API}/user/info/`)
  url.searchParams.set('fields', 'follower_count,following_count,likes_count,video_count')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  if (!res.ok) return {}
  const json = (await res.json()) as {
    data?: {
      user?: {
        follower_count?: number
        following_count?: number
        likes_count?: number
        video_count?: number
      }
    }
  }
  const u = json.data?.user
  if (!u) return {}
  return {
    followers: u.follower_count ?? 0,
    following: u.following_count ?? 0,
    likes: u.likes_count ?? 0,
    posts: u.video_count ?? 0,
  }
}

export async function syncPosts(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]> {
  if (ctx.platformPostIds.length === 0) return []
  const out: PostSnapshot[] = []
  for (let i = 0; i < ctx.platformPostIds.length; i += 20) {
    const batch = ctx.platformPostIds.slice(i, i + 20)
    const url = new URL(`${API}/video/query/`)
    url.searchParams.set('fields', 'id,like_count,comment_count,share_count,view_count')
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filters: { video_ids: batch } }),
    })
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    if (!res.ok) continue
    const json = (await res.json()) as {
      data?: {
        videos?: Array<{
          id: string
          like_count?: number
          comment_count?: number
          share_count?: number
          view_count?: number
        }>
      }
    }
    for (const v of json.data?.videos ?? []) {
      const likes = v.like_count ?? 0
      const comments = v.comment_count ?? 0
      const shares = v.share_count ?? 0
      out.push({
        platformPostId: v.id,
        likes,
        comments,
        shares,
        views: v.view_count ?? 0,
        engagements: likes + comments + shares,
      })
    }
  }
  return out
}
