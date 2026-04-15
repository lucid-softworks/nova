import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

const API = 'https://graph.threads.net/v1.0'

type InsightsResponse = {
  data?: Array<{
    name: string
    values?: Array<{ value: unknown }>
    total_value?: { value: unknown }
  }>
  error?: { code?: number; message?: string }
}

function checkAuth(status: number, json: { error?: { code?: number } } | null): void {
  if (status === 401 || json?.error?.code === 190) {
    throw new Error('AUTH_EXPIRED')
  }
}

function userId(ctx: AnalyticsAccountCtx): string | null {
  const v = ctx.metadata.userId
  return typeof v === 'string' && v ? v : null
}

function readValue(row: { values?: Array<{ value: unknown }>; total_value?: { value: unknown } }): number | null {
  const v = row.total_value?.value ?? row.values?.[0]?.value
  return typeof v === 'number' ? v : null
}

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const id = userId(ctx)
  if (!id) return {}

  const snapshot: AccountSnapshot = {}

  try {
    const res = await fetch(
      `${API}/${id}/threads_insights?metric=followers_count,views&access_token=${encodeURIComponent(ctx.accessToken)}`,
    )
    const json = (await res.json().catch(() => null)) as InsightsResponse | null
    checkAuth(res.status, json)
    if (res.ok && json?.data) {
      for (const row of json.data) {
        const n = readValue(row)
        if (n === null) continue
        if (row.name === 'followers_count') snapshot.followers = n
        else if (row.name === 'views') snapshot.impressions = n
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

  for (const threadId of ctx.platformPostIds) {
    const snap: PostSnapshot = { platformPostId: threadId }

    try {
      const res = await fetch(
        `${API}/${threadId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${encodeURIComponent(ctx.accessToken)}`,
      )
      const json = (await res.json().catch(() => null)) as InsightsResponse | null
      checkAuth(res.status, json)
      if (res.ok && json?.data) {
        let reposts = 0
        let quotes = 0
        let hasShares = false
        for (const row of json.data) {
          const n = readValue(row)
          if (n === null) continue
          switch (row.name) {
            case 'views':
              snap.views = n
              snap.impressions = n
              break
            case 'likes':
              snap.likes = n
              break
            case 'replies':
              snap.comments = n
              break
            case 'reposts':
              reposts = n
              hasShares = true
              break
            case 'quotes':
              quotes = n
              hasShares = true
              break
          }
        }
        if (hasShares) snap.shares = reposts + quotes
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_EXPIRED') throw err
    }

    out.push(snap)
  }

  return out
}
