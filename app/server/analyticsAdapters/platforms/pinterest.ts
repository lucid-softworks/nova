import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

const API = 'https://api.pinterest.com/v5'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)
  const url = new URL(`${API}/user_account/analytics`)
  url.searchParams.set('start_date', start)
  url.searchParams.set('end_date', today())
  url.searchParams.set('metric_types', 'IMPRESSION,PIN_CLICK,ENGAGEMENT')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  })
  if (!res.ok) return {}
  const json = (await res.json()) as {
    all?: {
      lifetime_metrics?: Record<string, number>
      summary_metrics?: Record<string, number>
    }
  }
  const m = json.all?.summary_metrics ?? {}
  return {
    impressions: m.IMPRESSION ?? 0,
    clicks: m.PIN_CLICK ?? 0,
    engagements: m.ENGAGEMENT ?? 0,
  }
}

export async function syncPosts(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]> {
  if (ctx.platformPostIds.length === 0) return []
  const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)
  const out: PostSnapshot[] = []
  for (const id of ctx.platformPostIds) {
    const url = new URL(`${API}/pins/${encodeURIComponent(id)}/analytics`)
    url.searchParams.set('start_date', start)
    url.searchParams.set('end_date', today())
    url.searchParams.set('metric_types', 'IMPRESSION,PIN_CLICK,ENGAGEMENT,SAVE')
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    })
    if (!res.ok) continue
    const json = (await res.json()) as {
      all_time?: {
        summary_metrics?: Record<string, number>
      }
    }
    const m = json.all_time?.summary_metrics ?? {}
    out.push({
      platformPostId: id,
      impressions: m.IMPRESSION ?? 0,
      clicks: m.PIN_CLICK ?? 0,
      engagements: m.ENGAGEMENT ?? 0,
      shares: m.SAVE ?? 0,
    })
  }
  return out
}
