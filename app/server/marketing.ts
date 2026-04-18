import { createServerFn } from '@tanstack/react-start'
import { asc } from 'drizzle-orm'
import { db, schema } from './db'

export type PublicPlan = {
  key: string
  label: string
  description: string | null
  priceDisplay: string | null
  featured: boolean
  maxMembers: number
  maxConnectedAccounts: number
  maxScheduledPostsPerMonth: number
  aiAssistEnabled: boolean
}

/**
 * Public, unauthenticated plan listing used by the marketing homepage.
 * Returns only presentation fields — no provider IDs / checkout details.
 */
export const listPublicPlans = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PublicPlan[]> => {
    const rows = await db
      .select()
      .from(schema.platformPlans)
      .orderBy(asc(schema.platformPlans.sortOrder))
    return rows.map((r) => ({
      key: r.key,
      label: r.label,
      description: r.description,
      priceDisplay: r.priceDisplay,
      featured: r.featured,
      maxMembers: r.maxMembers,
      maxConnectedAccounts: r.maxConnectedAccounts,
      maxScheduledPostsPerMonth: r.maxScheduledPostsPerMonth,
      aiAssistEnabled: r.aiAssistEnabled,
    }))
  },
)
