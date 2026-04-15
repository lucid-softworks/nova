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

function pageId(ctx: AnalyticsAccountCtx): string | null {
  const v = ctx.metadata.pageId
  return typeof v === 'string' && v ? v : null
}

function sumReactions(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  let total = 0
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (typeof v === 'number') total += v
  }
  return total
}

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const id = pageId(ctx)
  if (!id) return {}

  const snapshot: AccountSnapshot = {}

  try {
    const res = await fetch(
      `${API}/${id}?fields=fan_count,followers_count&access_token=${encodeURIComponent(ctx.accessToken)}`,
    )
    const json = (await res.json().catch(() => null)) as
      | { fan_count?: number; followers_count?: number; error?: { code?: number } }
      | null
    checkAuth(res.status, json)
    if (res.ok && json) {
      snapshot.followers = json.followers_count ?? json.fan_count ?? 0
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_EXPIRED') throw err
  }

  try {
    const res = await fetch(
      `${API}/${id}/insights?metric=page_impressions,page_engaged_users&period=day&access_token=${encodeURIComponent(ctx.accessToken)}`,
    )
    const json = (await res.json().catch(() => null)) as InsightsResponse | null
    checkAuth(res.status, json)
    if (res.ok && json?.data) {
      for (const row of json.data) {
        const value = row.values?.[0]?.value
        const n = typeof value === 'number' ? value : 0
        if (row.name === 'page_impressions') snapshot.impressions = n
        else if (row.name === 'page_engaged_users') snapshot.engagements = n
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

  for (const postId of ctx.platformPostIds) {
    const snap: PostSnapshot = { platformPostId: postId }

    try {
      const res = await fetch(
        `${API}/${postId}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_clicks,post_reactions_by_type_total&access_token=${encodeURIComponent(ctx.accessToken)}`,
      )
      const json = (await res.json().catch(() => null)) as InsightsResponse | null
      checkAuth(res.status, json)
      if (res.ok && json?.data) {
        for (const row of json.data) {
          const value = row.values?.[0]?.value
          if (row.name === 'post_impressions' && typeof value === 'number') snap.impressions = value
          else if (row.name === 'post_impressions_unique' && typeof value === 'number') snap.reach = value
          else if (row.name === 'post_engaged_users' && typeof value === 'number') snap.engagements = value
          else if (row.name === 'post_clicks' && typeof value === 'number') snap.clicks = value
          else if (row.name === 'post_reactions_by_type_total') snap.likes = sumReactions(value)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_EXPIRED') throw err
    }

    try {
      const res = await fetch(
        `${API}/${postId}?fields=shares,comments.summary(total_count),reactions.summary(total_count)&access_token=${encodeURIComponent(ctx.accessToken)}`,
      )
      const json = (await res.json().catch(() => null)) as
        | {
            shares?: { count?: number }
            comments?: { summary?: { total_count?: number } }
            reactions?: { summary?: { total_count?: number } }
            error?: { code?: number }
          }
        | null
      checkAuth(res.status, json)
      if (res.ok && json) {
        if (typeof json.shares?.count === 'number') snap.shares = json.shares.count
        if (typeof json.comments?.summary?.total_count === 'number') {
          snap.comments = json.comments.summary.total_count
        }
        if (snap.likes === undefined && typeof json.reactions?.summary?.total_count === 'number') {
          snap.likes = json.reactions.summary.total_count
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_EXPIRED') throw err
    }

    out.push(snap)
  }

  return out
}
