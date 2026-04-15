import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

const API = 'https://api.twitter.com/2'

async function userId(ctx: AnalyticsAccountCtx): Promise<string | null> {
  const fromMeta = ctx.metadata.userId ?? ctx.metadata.id
  if (typeof fromMeta === 'string' && fromMeta) return fromMeta
  const res = await fetch(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { data?: { id?: string } }
  return json.data?.id ?? null
}

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const id = await userId(ctx)
  if (!id) return {}
  const res = await fetch(
    `${API}/users/${id}?user.fields=public_metrics`,
    { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
  )
  if (!res.ok) return {}
  const json = (await res.json()) as {
    data?: {
      public_metrics?: {
        followers_count?: number
        following_count?: number
        tweet_count?: number
      }
    }
  }
  const m = json.data?.public_metrics
  if (!m) return {}
  return {
    followers: m.followers_count ?? 0,
    following: m.following_count ?? 0,
    posts: m.tweet_count ?? 0,
  }
}

export async function syncPosts(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]> {
  if (ctx.platformPostIds.length === 0) return []
  const out: PostSnapshot[] = []
  for (let i = 0; i < ctx.platformPostIds.length; i += 100) {
    const batch = ctx.platformPostIds.slice(i, i + 100)
    const url = new URL(`${API}/tweets`)
    url.searchParams.set('ids', batch.join(','))
    url.searchParams.set('tweet.fields', 'public_metrics,non_public_metrics')
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    })
    if (!res.ok) continue
    const json = (await res.json()) as {
      data?: Array<{
        id: string
        public_metrics?: {
          retweet_count?: number
          reply_count?: number
          like_count?: number
          quote_count?: number
          impression_count?: number
        }
        non_public_metrics?: { impression_count?: number; url_link_clicks?: number }
      }>
    }
    for (const t of json.data ?? []) {
      const pm = t.public_metrics ?? {}
      const np = t.non_public_metrics ?? {}
      const impressions = np.impression_count ?? pm.impression_count ?? 0
      const likes = pm.like_count ?? 0
      const shares = (pm.retweet_count ?? 0) + (pm.quote_count ?? 0)
      const comments = pm.reply_count ?? 0
      out.push({
        platformPostId: t.id,
        likes,
        shares,
        comments,
        impressions,
        clicks: np.url_link_clicks ?? 0,
        engagements: likes + shares + comments,
      })
    }
  }
  return out
}
