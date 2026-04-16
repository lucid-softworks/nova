import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { SettingsNav } from '~/components/settings/SettingsNav'
import {
  getBillingSummary,
  startCheckout,
  openBillingPortal,
  type BillingSummary,
} from '~/server/billing'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/billing')({
  loader: async ({ params }) => ({
    summary: await getBillingSummary({ data: { workspaceSlug: params.workspaceSlug } }),
  }),
  component: BillingSettings,
})

const PLANS = ['starter', 'pro', 'business'] as const
type Plan = (typeof PLANS)[number]

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const danger = pct >= 90
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2">
      <div className="flex items-baseline justify-between">
        <div className="text-xs text-neutral-600 dark:text-neutral-300">{label}</div>
        <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
          {used}/{limit}
        </div>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className={danger ? 'h-full bg-red-500' : 'h-full bg-indigo-500'}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function BillingSettings() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const { workspace } = Route.useRouteContext()
  const { summary } = Route.useLoaderData() as { summary: BillingSummary }
  const [busy, setBusy] = useState<Plan | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canManage = workspace.role === 'admin'

  const upgrade = async (plan: Plan) => {
    setBusy(plan)
    setError(null)
    try {
      const res = await startCheckout({ data: { workspaceSlug, plan } })
      window.location.href = res.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start checkout')
      setBusy(null)
    }
  }

  const manage = async () => {
    setBusy('portal')
    setError(null)
    try {
      const res = await openBillingPortal({ data: { workspaceSlug } })
      window.location.href = res.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open billing portal')
      setBusy(null)
    }
  }

  const disabled = summary.provider === 'none'

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="billing" />
      <Card>
        <div className="space-y-3 p-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('billing.title')}</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('billing.provider')}: <span className="font-medium">{summary.provider}</span>
            </p>
          </div>
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3 text-sm">
            <div>
              {t('billing.currentPlan')}: <span className="font-medium">{summary.plan ?? t('billing.free')}</span>
            </div>
            <div>
              {t('billing.status')}: <span className="font-medium">{summary.status}</span>
            </div>
            {summary.currentPeriodEnd ? (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Renews on {new Date(summary.currentPeriodEnd).toLocaleDateString()}
              </div>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <UsageBar
              label={t('billing.members')}
              used={summary.usage.members}
              limit={summary.limits.maxMembers}
            />
            <UsageBar
              label={t('billing.connectedAccounts')}
              used={summary.usage.connectedAccounts}
              limit={summary.limits.maxConnectedAccounts}
            />
            <UsageBar
              label={t('billing.scheduledPosts')}
              used={summary.usage.scheduledPostsThisPeriod}
              limit={summary.limits.maxScheduledPostsPerMonth}
            />
          </div>

          {disabled ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('billing.billingDisabledMessage')}
            </p>
          ) : !canManage ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('billing.onlyAdmins')}</p>
          ) : summary.status === 'active' || summary.status === 'trialing' ? (
            <div>
              <Button onClick={manage} disabled={busy !== null}>
                {busy === 'portal' ? <Spinner /> : null} {t('billing.manageBilling')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {PLANS.map((plan) => (
                <Button
                  key={plan}
                  variant={plan === 'pro' ? 'default' : 'outline'}
                  onClick={() => upgrade(plan)}
                  disabled={busy !== null}
                >
                  {busy === plan ? <Spinner /> : null}
                  {t('billing.upgradeTo', { plan })}
                </Button>
              ))}
            </div>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </Card>
    </div>
  )
}
