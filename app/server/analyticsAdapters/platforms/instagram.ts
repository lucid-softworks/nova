import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

const API = 'https://graph.facebook.com/v19.0'

type InsightsResponse = {
  data?: Array<{
    name: string
    values?: Array<{ value: unknown }>
  }>
  error?: { code?: number; message?: string }
}

function checkAuth(status: number, json: { error?: { code?: number } } | null): void {
  if (status === 401 || json?.error?.code === 190) {
    throw new Error('AUTH_EXPIRED')
  }
}

function igUserId(ctx: AnalyticsAccountCtx): string | null {
  const v = ctx.metadata.igUserId
  return typeof v === 'string' && v ? v : null
}

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const id = igUserId(ctx)
  if (!id) return {}

  const snapshot: AccountSnapshot = {}

  try {
    const res = await fetch(
      `${API}/${id}?fields=followers_count,media_count,follows_count&access_token=${encodeURIComponent(ctx.accessToken)}`,
    )
    const json = (await res.json().catch(() => null)) as
      | {
          followers_count?: number
          media_count?: number
          follows_count?: number
          error?: { code?: number }
        }
      | null
    checkAuth(res.status, json)
    if (res.ok && json) {
      if (typeof json.followers_count === 'number') snapshot.followers = json.followers_count
      if (typeof json.follows_count === 'number') snapshot.following = json.follows_count
      if (typeof json.media_count === 'number') snapshot.posts = json.media_count
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_EXPIRED') throw err
  }

  try {
    const res = await fetch(
      `${API}/${id}/insights?metric=reach,impressions,profile_views&period=day&access_token=${encodeURIComponent(ctx.accessToken)}`,
    )
    const json = (await res.json().catch(() => null)) as InsightsResponse | null
    checkAuth(res.status, json)
    if (res.ok && json?.data) {
      for (const row of json.data) {
        const value = row.values?.[0]?.value
        const n = typeof value === 'number' ? value : 0
        if (row.name === 'reach') snapshot.reach = n
        else if (row.name === 'impressions') snapshot.impressions = n
        else if (row.name === 'profile_views') snapshot.clicks = n
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_EXPIRED') throw err
  }

  return snapshot
}

export async function syncPosts(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]> {
  if (ctx.platformPostIds.length === 0) return []
  const out: PostSnapshot[] = []

  for (const mediaId of ctx.platformPostIds) {
    const snap: PostSnapshot = { platformPostId: mediaId }

    try {
      const res = await fetch(
        `${API}/${mediaId}/insights?metric=impressions,reach,engagement,likes,comments,saved,shares,video_views&access_token=${encodeURIComponent(ctx.accessToken)}`,
      )
      const json = (await res.json().catch(() => null)) as InsightsResponse | null
      checkAuth(res.status, json)
      if (res.ok && json?.data) {
        for (const row of json.data) {
          const value = row.values?.[0]?.value
          if (typeof value !== 'number') continue
          switch (row.name) {
            case 'impressions':
              snap.impressions = value
              break
            case 'reach':
              snap.reach = value
              break
            case 'engagement':
              snap.engagements = value
              break
            case 'likes':
              snap.likes = value
              break
            case 'comments':
              snap.comments = value
              break
            case 'shares':
              snap.shares = value
              break
            case 'video_views':
              snap.views = value
              break
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_EXPIRED') throw err
    }

    out.push(snap)
  }

  return out
}
