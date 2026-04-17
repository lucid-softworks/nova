import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, ExternalLink, RotateCw, SkipForward, Zap } from 'lucide-react'
import {
  getCampaignAnalytics,
  getCampaignDetail,
  retryPost,
  skipCampaignStep,
  triggerCampaignStepNow,
  type CampaignAnalytics,
  type CampaignDetail,
} from '~/server/posts'
import { PLATFORMS } from '~/lib/platforms'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { CampaignStatusBadge, PostStatusBadge } from '~/components/posts/badges'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/posts/campaigns/$campaignId')({
  loader: async ({ params }) => {
    const [detail, analytics] = await Promise.all([
      getCampaignDetail({
        data: { workspaceSlug: params.workspaceSlug, campaignId: params.campaignId },
      }),
      getCampaignAnalytics({
        data: { workspaceSlug: params.workspaceSlug, campaignId: params.campaignId },
      }),
    ])
    if (!detail) throw notFound()
    return { detail, analytics }
  },
  component: CampaignDetailPage,
})

function CampaignDetailPage() {
  const { workspaceSlug } = Route.useParams()
  const t = useT()
  const initial = Route.useLoaderData()
  const [detail, setDetail] = useState<CampaignDetail>(initial.detail)
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(initial.analytics)
  const [tab, setTab] = useState<'steps' | 'analytics'>('steps')

  const reload = async () => {
    const [fresh, freshAnalytics] = await Promise.all([
      getCampaignDetail({ data: { workspaceSlug, campaignId: detail.id } }),
      getCampaignAnalytics({ data: { workspaceSlug, campaignId: detail.id } }),
    ])
    if (fresh) setDetail(fresh)
    setAnalytics(freshAnalytics)
  }

  const publishedSteps = detail.steps.filter((s) => s.status === 'published').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/$workspaceSlug/posts" params={{ workspaceSlug }}>
              <ArrowLeft className="h-4 w-4" /> Posts
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{detail.name}</h2>
              <CampaignStatusBadge status={detail.status} />
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              {t('campaign.stepsPublished', { published: String(publishedSteps), total: String(detail.steps.length) })}
            </div>
          </div>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${(publishedSteps / Math.max(1, detail.steps.length)) * 100}%` }}
        />
      </div>

      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {(['steps', 'analytics'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'px-3 py-2 text-sm font-medium',
              tab === k
                ? 'border-b-2 border-indigo-500 text-indigo-600'
                : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50',
            )}
          >
            {k === 'steps' ? t('campaign.stepsTab') : t('campaign.analyticsTab')}
          </button>
        ))}
      </div>

      {tab === 'steps' ? (
        <div className="space-y-3">
          {detail.stepsWithPlatforms.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              allSteps={detail.steps}
              workspaceSlug={workspaceSlug}
              onRetry={async () => {
                if (step.post) {
                  await retryPost({ data: { workspaceSlug, postId: step.post.id } })
                  await reload()
                }
              }}
              onSkip={async () => {
                await skipCampaignStep({ data: { workspaceSlug, stepId: step.id } })
                await reload()
              }}
              onTriggerNow={async () => {
                await triggerCampaignStepNow({ data: { workspaceSlug, stepId: step.id } })
                await reload()
              }}
            />
          ))}
        </div>
      ) : (
        <CampaignAnalyticsPanel analytics={analytics} />
      )}
    </div>
  )
}

function CampaignAnalyticsPanel({ analytics }: { analytics: CampaignAnalytics | null }) {
  const t = useT()
  if (!analytics) {
    return <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">{t('campaign.analyticsUnavailable')}</div>
  }
  const { totals, byPlatform } = analytics
  const fmt = (n: number) => n.toLocaleString()
  const hasData = totals.reach + totals.impressions + totals.engagements > 0

  const kpis = [
    { label: t('analytics.reach'), value: fmt(totals.reach) },
    { label: t('analytics.impressions'), value: fmt(totals.impressions) },
    { label: t('analytics.engagements'), value: fmt(totals.engagements) },
    { label: t('analytics.likes'), value: fmt(totals.likes) },
    { label: t('analytics.comments'), value: fmt(totals.comments) },
    { label: t('analytics.shares'), value: fmt(totals.shares) },
    { label: t('analytics.clicks'), value: fmt(totals.clicks) },
    { label: t('campaign.stepsPublishedKpi'), value: `${totals.publishedSteps}/${totals.totalSteps}` },
  ]

  return (
    <div className="space-y-4">
      {!hasData ? (
        <div className="rounded border border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3 text-xs text-neutral-500 dark:text-neutral-400">
          {t('campaign.noAnalyticsYet')}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <div className="p-3">
              <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{k.label}</div>
              <div className="mt-0.5 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{k.value}</div>
            </div>
          </Card>
        ))}
      </div>
      {byPlatform.length > 0 ? (
        <Card>
          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('campaign.byPlatform')}</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                <tr>
                  <th className="py-1">{t('campaign.platform')}</th>
                  <th className="py-1 text-right">{t('analytics.posts')}</th>
                  <th className="py-1 text-right">{t('analytics.reach')}</th>
                  <th className="py-1 text-right">{t('analytics.impressions')}</th>
                  <th className="py-1 text-right">{t('analytics.engagements')}</th>
                  <th className="py-1 text-right">{t('campaign.engRate')}</th>
                </tr>
              </thead>
              <tbody>
                {byPlatform.map((r) => (
                  <tr key={r.platform} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1.5">
                      <div className="flex items-center gap-1.5">
                        <PlatformIcon platform={r.platform} size={14} />
                        {PLATFORMS[r.platform].label}
                      </div>
                    </td>
                    <td className="py-1.5 text-right">{fmt(r.posts)}</td>
                    <td className="py-1.5 text-right">{fmt(r.reach)}</td>
                    <td className="py-1.5 text-right">{fmt(r.impressions)}</td>
                    <td className="py-1.5 text-right">{fmt(r.engagements)}</td>
                    <td className="py-1.5 text-right">{(r.engagementRate * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function StepCard({
  step,
  allSteps,
  workspaceSlug: _workspaceSlug,
  onRetry,
  onSkip,
  onTriggerNow,
}: {
  step: CampaignDetail['stepsWithPlatforms'][number]
  allSteps: CampaignDetail['steps']
  workspaceSlug: string
  onRetry: () => Promise<void>
  onSkip: () => Promise<void>
  onTriggerNow: () => Promise<void>
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const canTrigger =
    step.status === 'waiting' || step.status === 'ready' || step.status === 'on_hold'
  const canSkip =
    step.status === 'waiting' || step.status === 'ready' || step.status === 'on_hold'
  const guarded = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const depIndex = step.dependsOnStepId
    ? allSteps.findIndex((s) => s.id === step.dependsOnStepId)
    : -1
  const triggerDesc =
    depIndex < 0
      ? step.triggerScheduledAt
        ? t('campaign.scheduledFor', { date: new Date(step.triggerScheduledAt).toLocaleString() })
        : t('campaign.rootStep')
      : step.triggerType === 'immediate'
        ? t('campaign.firesImmediately', { n: String(depIndex + 1) })
        : step.triggerType === 'delay'
          ? t('campaign.firesAfterDelay', { minutes: String(step.triggerDelayMinutes), n: String(depIndex + 1) })
          : t('campaign.firesAtScheduled', { date: step.triggerScheduledAt ? new Date(step.triggerScheduledAt).toLocaleString() : '' })

  const platformIcons = new Set<string>()
  for (const p of step.post?.platforms ?? []) platformIcons.add(p.platform)

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('campaign.step', { n: String(step.stepOrder + 1) })}</div>
              <div className="flex gap-0.5">
                {[...platformIcons].map((p) => (
                  <PlatformIcon key={p} platform={p as keyof typeof PLATFORMS} size={16} />
                ))}
              </div>
              {step.post ? <PostStatusBadge status={step.post.status} /> : null}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{triggerDesc}</div>
          </div>
          <div className="flex flex-wrap gap-1">
            {canTrigger ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void guarded(onTriggerNow)}
                disabled={busy}
              >
                <Zap className="h-3 w-3" /> {t('campaign.triggerNow')}
              </Button>
            ) : null}
            {canSkip ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!confirm(t('campaign.skipConfirm'))) return
                  void guarded(onSkip)
                }}
                disabled={busy}
              >
                <SkipForward className="h-3 w-3" /> {t('campaign.skip')}
              </Button>
            ) : null}
            {step.post?.status === 'failed' ? (
              <Button size="sm" variant="outline" onClick={() => void guarded(onRetry)} disabled={busy}>
                <RotateCw className="h-3 w-3" /> {t('campaign.retry')}
              </Button>
            ) : null}
          </div>
        </div>

        {step.post ? (
          <div className="rounded-md bg-neutral-50 dark:bg-neutral-900 p-3 text-sm text-neutral-700 dark:text-neutral-200">
            {step.post.defaultContent || <span className="italic text-neutral-400 dark:text-neutral-500">{t('campaign.noContent')}</span>}
          </div>
        ) : null}

        {step.post?.failureReason ? (
          <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/40 p-2 text-xs text-red-700 dark:text-red-300">
            {step.post.failureReason}
          </div>
        ) : null}

        {step.publishedUrls.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {step.publishedUrls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50"
              >
                <ExternalLink className="h-3 w-3" /> {t('campaign.view')}
              </a>
            ))}
          </div>
        ) : null}

        {step.status === 'waiting' ? (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {t('campaign.waitingForStep', { n: String(depIndex + 1) })}
          </div>
        ) : null}
        {step.status === 'on_hold' ? (
          <div className="text-xs text-yellow-700">{t('campaign.onHold')}</div>
        ) : null}
      </div>
    </Card>
  )
}
