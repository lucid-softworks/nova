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
  // Capture previous status so we can detect a paid transition.
  const prior = await db.query.workspaceSubscriptions.findFirst({
    where: eq(schema.workspaceSubscriptions.workspaceId, workspaceId),
    columns: { status: true },
  })
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

  // Notify platform admins on the first transition into a paid state. We
  // treat active + trialing as "paid" here — both are revenue signals.
  const wasPaid = prior?.status === 'active' || prior?.status === 'trialing'
  const isPaid = values.status === 'active' || values.status === 'trialing'
  if (!wasPaid && isPaid) {
    try {
      const { notifyPlatformAdmins } = await import('~/server/notifications.server')
      const workspace = await db.query.workspaces.findFirst({
        where: eq(schema.workspaces.id, workspaceId),
        columns: { id: true, organizationId: true },
      })
      const org = workspace?.organizationId
        ? await db.query.organization.findFirst({
            where: eq(schema.organization.id, workspace.organizationId),
            columns: { name: true, slug: true },
          })
        : null
      await notifyPlatformAdmins({
        type: 'admin_workspace_upgraded',
        title: 'New paid subscription',
        body: `${org?.name ?? 'A workspace'} just upgraded to ${values.plan ?? provider}`,
        data: {
          workspaceId,
          provider,
          plan: values.plan,
          status: values.status,
        },
      })
    } catch {
      // best-effort — never let notification failures block billing
    }
  }
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
