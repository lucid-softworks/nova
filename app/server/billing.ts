import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getBillingProvider, currentBillingProviderName } from '~/lib/billing'
import { getSubscription } from '~/lib/billing/persist'
import { limitsFor, usageFor, type PlanLimits } from '~/lib/billing/limits'
import { requireWorkspaceAccess } from './session.server'

const checkoutInput = z.object({
  workspaceSlug: z.string().min(1),
  plan: z.string().min(1),
})

function returnUrl(slug: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  return `${base}/${slug}/settings?tab=billing`
}

export const startCheckout = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => checkoutInput.parse(d))
  .handler(async ({ data }) => {
    const r = await requireWorkspaceAccess(data.workspaceSlug)
    if (!r.ok) throw new Error(r.reason)
    if (r.workspace.role !== 'admin') throw new Error('Only admins can manage billing')
    const provider = getBillingProvider()
    const res = await provider.checkout(
      {
        userId: r.user.id,
        email: r.user.email,
        workspaceId: r.workspace.id,
        returnUrl: returnUrl(data.workspaceSlug),
      },
      data.plan,
    )
    return res
  })

const portalInput = z.object({ workspaceSlug: z.string().min(1) })

export const openBillingPortal = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => portalInput.parse(d))
  .handler(async ({ data }) => {
    const r = await requireWorkspaceAccess(data.workspaceSlug)
    if (!r.ok) throw new Error(r.reason)
    if (r.workspace.role !== 'admin') throw new Error('Only admins can manage billing')
    const provider = getBillingProvider()
    return provider.portal({
      userId: r.user.id,
      email: r.user.email,
      workspaceId: r.workspace.id,
      returnUrl: returnUrl(data.workspaceSlug),
    })
  })

export type BillingSummary = {
  provider: string
  plan: string | null
  status: string
  currentPeriodEnd: string | null
  limits: PlanLimits
  usage: {
    members: number
    connectedAccounts: number
    scheduledPostsThisPeriod: number
  }
}

export const getBillingSummary = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => portalInput.parse(d))
  .handler(async ({ data }): Promise<BillingSummary> => {
    const r = await requireWorkspaceAccess(data.workspaceSlug)
    if (!r.ok) throw new Error(r.reason)
    const [sub, limits, usage] = await Promise.all([
      getSubscription(r.workspace.id),
      limitsFor(r.workspace.id),
      usageFor(r.workspace.id),
    ])
    return {
      provider: currentBillingProviderName(),
      plan: sub?.plan ?? null,
      status: sub?.status ?? 'none',
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      limits,
      usage: {
        members: usage.members,
        connectedAccounts: usage.connectedAccounts,
        scheduledPostsThisPeriod: usage.scheduledPostsThisPeriod,
      },
    }
  })
