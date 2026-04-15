import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

const API = 'https://api.linkedin.com'

function headers(ctx: AnalyticsAccountCtx): HeadersInit {
  return {
    Authorization: `Bearer ${ctx.accessToken}`,
    'LinkedIn-Version': '202401',
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

function urnOf(ctx: AnalyticsAccountCtx): string | null {
  const urn = ctx.metadata.urn
  return typeof urn === 'string' && urn ? urn : null
}

function isOrg(urn: string): boolean {
  return urn.startsWith('urn:li:organization:')
}

function assertAuth(status: number): void {
  if (status === 401) throw new Error('AUTH_EXPIRED')
}

async function personFollowers(ctx: AnalyticsAccountCtx, urn: string): Promise<number> {
  try {
    const res = await fetch(
      `${API}/rest/networkSizes/${encodeURIComponent(urn)}?edgeType=CompanyFollowedByMember`,
      { headers: headers(ctx) },
    )
    assertAuth(res.status)
    if (!res.ok) return 0
    const json = (await res.json()) as { firstDegreeSize?: number }
    return json.firstDegreeSize ?? 0
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_EXPIRED') throw err
    return 0
  }
}

async function orgFollowers(ctx: AnalyticsAccountCtx, urn: string): Promise<number> {
  const url = `${API}/rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(urn)}`
  const res = await fetch(url, { headers: headers(ctx) })
  assertAuth(res.status)
  if (!res.ok) return 0
  const json = (await res.json()) as {
    elements?: Array<{
      followerGains?: { organicFollowerGain?: number; paidFollowerGain?: number }
      followerCountsByAssociationType?: Array<{ followerCounts?: { organicFollowerCount?: number; paidFollowerCount?: number } }>
    }>
  }
  let total = 0
  for (const el of json.elements ?? []) {
    for (const a of el.followerCountsByAssociationType ?? []) {
      total += (a.followerCounts?.organicFollowerCount ?? 0) + (a.followerCounts?.paidFollowerCount ?? 0)
    }
  }
  return total
}

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const urn = urnOf(ctx)
  if (!urn) return {}
  try {
    const followers = isOrg(urn) ? await orgFollowers(ctx, urn) : await personFollowers(ctx, urn)
    return { followers }
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_EXPIRED') throw err
    return {}
  }
}

export async function syncPosts(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]> {
  const urn = urnOf(ctx)
  if (!urn || !isOrg(urn) || ctx.platformPostIds.length === 0) return []
  const out: PostSnapshot[] = []
  for (let i = 0; i < ctx.platformPostIds.length; i += 50) {
    const batch = ctx.platformPostIds.slice(i, i + 50)
    const params = new URLSearchParams()
    params.set('q', 'organizationalEntity')
    params.set('organizationalEntity', urn)
    for (const id of batch) params.append('shares', id)
    const res = await fetch(`${API}/rest/organizationalEntityShareStatistics?${params.toString()}`, {
      headers: headers(ctx),
    })
    assertAuth(res.status)
    if (!res.ok) continue
    const json = (await res.json()) as {
      elements?: Array<{
        share?: string
        totalShareStatistics?: {
          impressionCount?: number
          clickCount?: number
          engagement?: number
          likeCount?: number
          commentCount?: number
          shareCount?: number
        }
      }>
    }
    for (const el of json.elements ?? []) {
      if (!el.share) continue
      const s = el.totalShareStatistics ?? {}
      const likes = s.likeCount ?? 0
      const comments = s.commentCount ?? 0
      const shares = s.shareCount ?? 0
      out.push({
        platformPostId: el.share,
        likes,
        comments,
        shares,
        impressions: s.impressionCount ?? 0,
        clicks: s.clickCount ?? 0,
        engagements: Math.round((s.engagement ?? 0) * (s.impressionCount ?? 0)) || likes + comments + shares,
      })
    }
  }
  return out
}
