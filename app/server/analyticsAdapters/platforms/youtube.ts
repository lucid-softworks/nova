import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

const API = 'https://www.googleapis.com/youtube/v3'

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const res = await fetch(`${API}/channels?part=statistics&mine=true`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  if (!res.ok) return {}
  const json = (await res.json()) as {
    items?: Array<{
      statistics?: {
        subscriberCount?: string
        viewCount?: string
        videoCount?: string
      }
    }>
  }
  const s = json.items?.[0]?.statistics
  if (!s) return {}
  return {
    followers: Number(s.subscriberCount ?? 0),
    posts: Number(s.videoCount ?? 0),
    impressions: Number(s.viewCount ?? 0),
  }
}

export async function syncPosts(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]> {
  if (ctx.platformPostIds.length === 0) return []
  const out: PostSnapshot[] = []
  for (let i = 0; i < ctx.platformPostIds.length; i += 50) {
    const batch = ctx.platformPostIds.slice(i, i + 50)
    const url = new URL(`${API}/videos`)
    url.searchParams.set('part', 'statistics')
    url.searchParams.set('id', batch.join(','))
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    })
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    if (!res.ok) continue
    const json = (await res.json()) as {
      items?: Array<{
        id: string
        statistics?: {
          viewCount?: string
          likeCount?: string
          commentCount?: string
          favoriteCount?: string
        }
      }>
    }
    for (const v of json.items ?? []) {
      const s = v.statistics ?? {}
      const likes = Number(s.likeCount ?? 0)
      const comments = Number(s.commentCount ?? 0)
      out.push({
        platformPostId: v.id,
        views: Number(s.viewCount ?? 0),
        likes,
        comments,
        engagements: likes + comments,
      })
    }
  }
  return out
}
