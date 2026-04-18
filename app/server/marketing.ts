import { createServerFn } from '@tanstack/react-start'
import { asc, inArray } from 'drizzle-orm'
import { db, schema } from './db'

export type PublicPlan = {
  key: string
  label: string
  description: string | null
  priceDisplay: string | null
  /** Computed: plan with the most active paid subscribers gets this flag. */
  isMostPopular: boolean
  maxMembers: number
  maxConnectedAccounts: number
  maxScheduledPostsPerMonth: number
  aiAssistEnabled: boolean
}

/**
 * Public, unauthenticated plan listing used by the marketing homepage.
 * Returns only presentation fields — no provider IDs / checkout details.
 *
 * "Most popular" is derived from live subscription data: the plan with
 * the highest count of active/trialing subscriptions wins, so the badge
 * stays honest rather than being a marketing toggle.
 */
export const listPublicPlans = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PublicPlan[]> => {
    const [planRows, subRows] = await Promise.all([
      db.select().from(schema.platformPlans).orderBy(asc(schema.platformPlans.sortOrder)),
      db
        .select({
          provider: schema.workspaceSubscriptions.provider,
          plan: schema.workspaceSubscriptions.plan,
        })
        .from(schema.workspaceSubscriptions)
        .where(inArray(schema.workspaceSubscriptions.status, ['active', 'trialing'])),
    ])

    // Build a "<provider>:<planId>" → internal plan key lookup from the
    // providerIds jsonb on each plan row, so we can map live subscription
    // rows (whose `plan` column is the provider's SKU) to our own keys.
    const providerMap = new Map<string, string>()
    for (const p of planRows) {
      for (const [provider, ids] of Object.entries(p.providerIds ?? {})) {
        for (const id of ids) providerMap.set(`${provider}:${id}`, p.key)
      }
    }

    const counts = new Map<string, number>()
    for (const sub of subRows) {
      if (!sub.plan) continue
      const key = providerMap.get(`${sub.provider}:${sub.plan}`)
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    let topKey: string | null = null
    let topCount = 0
    for (const [key, count] of counts) {
      if (count > topCount) {
        topCount = count
        topKey = key
      }
    }

    return planRows.map((r) => ({
      key: r.key,
      label: r.label,
      description: r.description,
      priceDisplay: r.priceDisplay,
      isMostPopular: r.key === topKey && topCount > 0,
      maxMembers: r.maxMembers,
      maxConnectedAccounts: r.maxConnectedAccounts,
      maxScheduledPostsPerMonth: r.maxScheduledPostsPerMonth,
      aiAssistEnabled: r.aiAssistEnabled,
    }))
  },
)
