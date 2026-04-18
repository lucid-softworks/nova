import { and, eq, gte } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { getSubscription } from './persist'

/**
 * Quota configuration per logical plan name. The `plan` value stored on
 * `workspace_subscriptions` comes from the provider — we normalise common
 * casings here. Anything unrecognised (or null / inactive) falls back to
 * the `free` plan's limits.
 */
export type PlanLimits = {
  maxMembers: number
  maxConnectedAccounts: number
  maxScheduledPostsPerMonth: number
  aiAssistEnabled: boolean
}

const LIMITS: Record<string, PlanLimits> = {
  free: {
    maxMembers: 2,
    maxConnectedAccounts: 3,
    maxScheduledPostsPerMonth: 30,
    aiAssistEnabled: false,
  },
  starter: {
    maxMembers: 5,
    maxConnectedAccounts: 10,
    maxScheduledPostsPerMonth: 200,
    aiAssistEnabled: true,
  },
  pro: {
    maxMembers: 15,
    maxConnectedAccounts: 30,
    maxScheduledPostsPerMonth: 1000,
    aiAssistEnabled: true,
  },
  business: {
    maxMembers: 100,
    maxConnectedAccounts: 200,
    maxScheduledPostsPerMonth: 10000,
    aiAssistEnabled: true,
  },
}

/**
 * Resolve an incoming subscription to a plan key, preferring exact
 * provider-ID matches set on platform_plans. Falls back to substring
 * matching on the plan string so legacy setups (before admins populated
 * provider IDs) still work.
 */
async function resolvePlanKey(
  provider: string | null,
  plan: string | null,
  status: string,
): Promise<string> {
  if (!plan) return 'free'
  if (status !== 'active' && status !== 'trialing') return 'free'

  if (provider) {
    const rows = await db.select().from(schema.platformPlans)
    for (const row of rows) {
      const ids = (row.providerIds ?? {})[provider] ?? []
      if (ids.includes(plan)) return row.key
    }
  }

  const lower = plan.toLowerCase()
  for (const key of Object.keys(LIMITS)) {
    if (lower.includes(key)) return key
  }
  return 'free'
}

async function resolvePlanLimits(key: string): Promise<PlanLimits> {
  // DB-backed override if an admin has edited this plan's quotas via
  // /admin/plans. Falls back to the hardcoded defaults for any plan
  // that hasn't been persisted yet.
  const row = await db.query.platformPlans.findFirst({
    where: eq(schema.platformPlans.key, key),
  })
  if (row) {
    return {
      maxMembers: row.maxMembers,
      maxConnectedAccounts: row.maxConnectedAccounts,
      maxScheduledPostsPerMonth: row.maxScheduledPostsPerMonth,
      aiAssistEnabled: row.aiAssistEnabled,
    }
  }
  return LIMITS[key as keyof typeof LIMITS] ?? LIMITS.free!
}

export async function limitsFor(workspaceId: string): Promise<PlanLimits> {
  const ws = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
    columns: { planOverride: true },
  })
  if (ws?.planOverride) {
    return resolvePlanLimits(ws.planOverride)
  }
  const sub = await getSubscription(workspaceId)
  const key = await resolvePlanKey(sub?.provider ?? null, sub?.plan ?? null, sub?.status ?? 'none')
  return resolvePlanLimits(key)
}

export type WorkspaceUsage = {
  members: number
  connectedAccounts: number
  scheduledPostsThisPeriod: number
  periodStart: Date
}

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export async function usageFor(workspaceId: string): Promise<WorkspaceUsage> {
  const periodStart = monthStart()
  const [memberRows, accountRows, scheduledRows] = await Promise.all([
    db
      .select({ id: schema.member.id })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
      .innerJoin(
        schema.workspaces,
        eq(schema.workspaces.organizationId, schema.organization.id),
      )
      .where(eq(schema.workspaces.id, workspaceId)),
    db
      .select({ id: schema.socialAccounts.id })
      .from(schema.socialAccounts)
      .where(
        and(
          eq(schema.socialAccounts.workspaceId, workspaceId),
          eq(schema.socialAccounts.status, 'connected'),
        ),
      ),
    db
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.workspaceId, workspaceId),
          gte(schema.posts.scheduledAt, periodStart),
        ),
      ),
  ])

  return {
    members: memberRows.length,
    connectedAccounts: accountRows.length,
    scheduledPostsThisPeriod: scheduledRows.length,
    periodStart,
  }
}

type Guard = 'member' | 'account' | 'post'

export async function assertWithinLimit(
  workspaceId: string,
  guard: Guard,
): Promise<void> {
  const [limits, usage] = await Promise.all([limitsFor(workspaceId), usageFor(workspaceId)])
  if (guard === 'member' && usage.members >= limits.maxMembers) {
    throw new Error(
      `Plan limit reached: ${usage.members}/${limits.maxMembers} members. Upgrade to add more.`,
    )
  }
  if (guard === 'account' && usage.connectedAccounts >= limits.maxConnectedAccounts) {
    throw new Error(
      `Plan limit reached: ${usage.connectedAccounts}/${limits.maxConnectedAccounts} connected accounts. Upgrade to connect more.`,
    )
  }
  if (
    guard === 'post' &&
    usage.scheduledPostsThisPeriod >= limits.maxScheduledPostsPerMonth
  ) {
    throw new Error(
      `Plan limit reached: ${usage.scheduledPostsThisPeriod}/${limits.maxScheduledPostsPerMonth} scheduled posts this month. Upgrade for more.`,
    )
  }
}

export { LIMITS as PLAN_LIMITS }
