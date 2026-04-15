import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

function instanceBase(ctx: AnalyticsAccountCtx): string | null {
  const raw = (ctx.metadata.instance as string | undefined) ?? ''
  if (!raw) return null
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const base = instanceBase(ctx)
  if (!base) return {}
  const res = await fetch(`${base}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  })
  if (!res.ok) return {}
  const json = (await res.json()) as {
    followers_count?: number
    following_count?: number
    statuses_count?: number
  }
  return {
    followers: json.followers_count ?? 0,
    following: json.following_count ?? 0,
    posts: json.statuses_count ?? 0,
  }
}

export async function syncPosts(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]> {
  const base = instanceBase(ctx)
  if (!base || ctx.platformPostIds.length === 0) return []
  const out: PostSnapshot[] = []
  for (const id of ctx.platformPostIds) {
    const res = await fetch(`${base}/api/v1/statuses/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    })
    if (!res.ok) continue
    const s = (await res.json()) as {
      id: string
      favourites_count?: number
      reblogs_count?: number
      replies_count?: number
    }
    out.push({
      platformPostId: s.id,
      likes: s.favourites_count ?? 0,
      shares: s.reblogs_count ?? 0,
      comments: s.replies_count ?? 0,
      engagements: (s.favourites_count ?? 0) + (s.reblogs_count ?? 0) + (s.replies_count ?? 0),
    })
  }
  return out
}
