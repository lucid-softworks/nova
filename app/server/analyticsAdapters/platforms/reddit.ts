import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

const API = 'https://oauth.reddit.com'

function headers(ctx: AnalyticsAccountCtx): Record<string, string> {
  const ua =
    (ctx.metadata.userAgent as string | undefined) ??
    `nova:v1 (by /u/${ctx.accountHandle})`
  return { Authorization: `Bearer ${ctx.accessToken}`, 'User-Agent': ua }
}

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const res = await fetch(`${API}/api/v1/me`, { headers: headers(ctx) })
  if (!res.ok) return {}
  const json = (await res.json()) as {
    link_karma?: number
    comment_karma?: number
    total_karma?: number
  }
  // Reddit has no follower concept for user accounts; map karma to
  // engagements so the UI has something meaningful.
  return {
    engagements: json.total_karma ?? (json.link_karma ?? 0) + (json.comment_karma ?? 0),
  }
}

export async function syncPosts(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]> {
  if (ctx.platformPostIds.length === 0) return []
  // Reddit returns a listing keyed by t3_* fullnames; batch up to 100 per call.
  const out: PostSnapshot[] = []
  for (let i = 0; i < ctx.platformPostIds.length; i += 100) {
    const batch = ctx.platformPostIds.slice(i, i + 100).map((id) => (id.startsWith('t3_') ? id : `t3_${id}`))
    const url = new URL(`${API}/api/info`)
    url.searchParams.set('id', batch.join(','))
    const res = await fetch(url.toString(), { headers: headers(ctx) })
    if (!res.ok) continue
    const json = (await res.json()) as {
      data?: {
        children?: Array<{
          data?: {
            name?: string
            score?: number
            num_comments?: number
            ups?: number
            view_count?: number | null
          }
        }>
      }
    }
    for (const c of json.data?.children ?? []) {
      const d = c.data ?? {}
      if (!d.name) continue
      out.push({
        platformPostId: d.name,
        likes: d.ups ?? d.score ?? 0,
        comments: d.num_comments ?? 0,
        engagements: (d.ups ?? d.score ?? 0) + (d.num_comments ?? 0),
        views: d.view_count ?? 0,
      })
    }
  }
  return out
}
