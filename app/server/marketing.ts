import { createServerFn } from '@tanstack/react-start'
import { asc, inArray } from 'drizzle-orm'
import { db, schema } from './db'
import { logger } from '~/lib/logger'

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

// In-memory price cache for the billing provider lookup. The marketing
// page is hit by every anonymous visitor, so hitting the provider API on
// every request would slow down first paint. Prices change rarely enough
// that a 1h window is plenty fresh — restart the web service (or a deploy)
// if you need to invalidate sooner.
let priceCache: { fetchedAt: number; prices: Map<string, string> } | null = null
const PRICE_CACHE_TTL_MS = 60 * 60 * 1000

function formatCurrency(cents: number, currency: string, interval: string | null): string {
  const code = currency.toUpperCase()
  const amount = cents / 100
  const period = interval === 'year' ? '/yr' : interval === 'month' ? '/mo' : ''
  try {
    // Intl handles every ISO 4217 code + places the symbol/code correctly
    // per locale. en-US keeps the marketing page consistent; visitors'
    // currency still comes from whatever Polar returns on the product.
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount)
    return `${formatted}${period}`
  } catch {
    return `${amount.toFixed(cents % 100 === 0 ? 0 : 2)} ${code}${period}`
  }
}

/**
 * Fetch product prices from the billing provider and return a
 * productId → display string map. Only Polar is wired up today; other
 * providers can be added here when needed.
 */
async function fetchProviderPrices(productIds: string[]): Promise<Map<string, string>> {
  if (priceCache && Date.now() - priceCache.fetchedAt < PRICE_CACHE_TTL_MS) {
    return priceCache.prices
  }
  const provider = process.env.BILLING_PROVIDER
  const out = new Map<string, string>()
  if (provider !== 'polar' || productIds.length === 0) {
    priceCache = { fetchedAt: Date.now(), prices: out }
    return out
  }
  const accessToken = process.env.POLAR_ACCESS_TOKEN
  if (!accessToken) {
    priceCache = { fetchedAt: Date.now(), prices: out }
    return out
  }
  try {
    const { Polar } = await import('@polar-sh/sdk')
    const client = new Polar({ accessToken })
    await Promise.all(
      productIds.map(async (id) => {
        try {
          const product = await client.products.get({ id })
          // Prefer the monthly recurring price; fall back to whatever's first.
          type Price = {
            amountType?: string
            priceAmount?: number | null
            priceCurrency?: string | null
            recurringInterval?: string | null
          }
          const prices = (product.prices ?? []) as Price[]
          const monthly = prices.find((p) => p.recurringInterval === 'month')
          const chosen = monthly ?? prices[0]
          if (!chosen) return
          if (chosen.amountType === 'free' || !chosen.priceAmount) {
            out.set(id, 'Free')
            return
          }
          out.set(
            id,
            formatCurrency(
              chosen.priceAmount,
              chosen.priceCurrency ?? 'usd',
              chosen.recurringInterval ?? null,
            ),
          )
        } catch (err) {
          logger.warn({ err, productId: id }, 'polar product fetch failed')
        }
      }),
    )
  } catch (err) {
    logger.warn({ err }, 'polar price fetch failed')
  }
  priceCache = { fetchedAt: Date.now(), prices: out }
  return out
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

    // Pull live prices from the configured billing provider. The manual
    // price_display column is a fallback for plans with no provider ID or
    // when the provider API is unreachable.
    const activeProvider = process.env.BILLING_PROVIDER ?? null
    const productIds: string[] = []
    if (activeProvider) {
      for (const p of planRows) {
        const ids = (p.providerIds ?? {})[activeProvider] ?? []
        for (const id of ids) productIds.push(id)
      }
    }
    const livePrices = await fetchProviderPrices(productIds)

    return planRows.map((r) => {
      let priceDisplay = r.priceDisplay
      if (activeProvider) {
        const ids = (r.providerIds ?? {})[activeProvider] ?? []
        for (const id of ids) {
          const live = livePrices.get(id)
          if (live) {
            priceDisplay = live
            break
          }
        }
      }
      return {
        key: r.key,
        label: r.label,
        description: r.description,
        priceDisplay,
        isMostPopular: r.key === topKey && topCount > 0,
        maxMembers: r.maxMembers,
        maxConnectedAccounts: r.maxConnectedAccounts,
        maxScheduledPostsPerMonth: r.maxScheduledPostsPerMonth,
        aiAssistEnabled: r.aiAssistEnabled,
      }
    })
  },
)
