import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import type { BillingProviderName, SubscriptionState } from './types'

/**
 * Idempotent upsert keyed on workspaceId (one subscription per workspace).
 * Called from every provider's webhook handler.
 */
export async function upsertSubscription(
  workspaceId: string,
  provider: BillingProviderName,
  patch: Partial<Omit<SubscriptionState, 'provider'>> & {
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const values = {
    workspaceId,
    provider,
    customerId: patch.customerId ?? null,
    subscriptionId: patch.subscriptionId ?? null,
    plan: patch.plan ?? null,
    status: patch.status ?? 'none',
    currentPeriodEnd: patch.currentPeriodEnd ?? null,
    metadata: patch.metadata ?? {},
    updatedAt: new Date(),
  }
  await db
    .insert(schema.workspaceSubscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: schema.workspaceSubscriptions.workspaceId,
      set: {
        provider: values.provider,
        customerId: values.customerId,
        subscriptionId: values.subscriptionId,
        plan: values.plan,
        status: values.status,
        currentPeriodEnd: values.currentPeriodEnd,
        metadata: values.metadata,
        updatedAt: values.updatedAt,
      },
    })
}

export async function getSubscription(workspaceId: string): Promise<SubscriptionState | null> {
  const row = await db.query.workspaceSubscriptions.findFirst({
    where: eq(schema.workspaceSubscriptions.workspaceId, workspaceId),
  })
  if (!row) return null
  return {
    provider: row.provider as BillingProviderName,
    customerId: row.customerId,
    subscriptionId: row.subscriptionId,
    plan: row.plan,
    status: row.status as SubscriptionState['status'],
    currentPeriodEnd: row.currentPeriodEnd,
  }
}

/**
 * Find the workspace that owns a provider-specific customer id. Webhook
 * handlers use this when the event payload only carries the customer
 * (most common case — subscription lifecycle events).
 */
export async function findWorkspaceByCustomerId(
  provider: BillingProviderName,
  customerId: string,
): Promise<string | null> {
  const row = await db.query.workspaceSubscriptions.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.provider, provider), e(t.customerId, customerId)),
  })
  return row?.workspaceId ?? null
}
