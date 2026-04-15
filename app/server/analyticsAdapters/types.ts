import type { PlatformKey } from '~/lib/platforms'

/**
 * Minimal account snapshot matching `analytics_snapshots` columns.
 * Adapters only set fields they can answer for; missing fields stay 0
 * in the upserted row.
 */
export type AccountSnapshot = {
  followers?: number
  following?: number
  posts?: number
  reach?: number
  impressions?: number
  engagements?: number
  likes?: number
  comments?: number
  shares?: number
  clicks?: number
}

/**
 * Engagement metrics for a single published post on one platform.
 * Joined to `post_platforms` via `platformPostId`.
 */
export type PostSnapshot = {
  platformPostId: string
  likes?: number
  comments?: number
  shares?: number
  reach?: number
  impressions?: number
  engagements?: number
  clicks?: number
  views?: number
}

export type AnalyticsAccountCtx = {
  /** `socialAccounts` row fields — decrypted accessToken + refreshToken. */
  id: string
  platform: PlatformKey
  accountName: string
  accountHandle: string
  workspaceId: string
  accessToken: string
  refreshToken: string | null
  metadata: Record<string, unknown>
  /**
   * PlatformPostIds for posts the app has already published through this
   * account. Adapters that only return insights for posts they recognise
   * use this list to filter / page.
   */
  platformPostIds: string[]
}

export type AnalyticsAdapter = {
  syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot>
  /** Default returns []. Override when the platform exposes per-post metrics. */
  syncPosts?(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]>
}
