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
              <h2 className="text-2xl font-semibold text-neutral-900">{detail.name}</h2>
              <CampaignStatusBadge status={detail.status} />
            </div>
            <div className="text-sm text-neutral-500">
              {publishedSteps} of {detail.steps.length} steps published
            </div>
          </div>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${(publishedSteps / Math.max(1, detail.steps.length)) * 100}%` }}
        />
      </div>

      <div className="flex gap-1 border-b border-neutral-200">
        {(['steps', 'analytics'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'px-3 py-2 text-sm font-medium capitalize',
              tab === k
                ? 'border-b-2 border-indigo-500 text-indigo-600'
                : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            {k}
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
  if (!analytics) {
    return <div className="py-12 text-center text-sm text-neutral-500">Analytics unavailable.</div>
  }
  const { totals, byPlatform } = analytics
  const fmt = (n: number) => n.toLocaleString()
  const hasData = totals.reach + totals.impressions + totals.engagements > 0

  const kpis = [
    { label: 'Reach', value: fmt(totals.reach) },
    { label: 'Impressions', value: fmt(totals.impressions) },
    { label: 'Engagements', value: fmt(totals.engagements) },
    { label: 'Likes', value: fmt(totals.likes) },
    { label: 'Comments', value: fmt(totals.comments) },
    { label: 'Shares', value: fmt(totals.shares) },
    { label: 'Clicks', value: fmt(totals.clicks) },
    { label: 'Steps Published', value: `${totals.publishedSteps}/${totals.totalSteps}` },
  ]

  return (
    <div className="space-y-4">
      {!hasData ? (
        <div className="rounded border border-dashed border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
          No analytics snapshots have arrived for this campaign yet. Numbers will populate once the analytics sync runs.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <div className="p-3">
              <div className="text-xs uppercase tracking-wider text-neutral-500">{k.label}</div>
              <div className="mt-0.5 text-xl font-semibold text-neutral-900">{k.value}</div>
            </div>
          </Card>
        ))}
      </div>
      {byPlatform.length > 0 ? (
        <Card>
          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">By platform</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="py-1">Platform</th>
                  <th className="py-1 text-right">Posts</th>
                  <th className="py-1 text-right">Reach</th>
                  <th className="py-1 text-right">Impressions</th>
                  <th className="py-1 text-right">Engagements</th>
                  <th className="py-1 text-right">Eng. Rate</th>
                </tr>
              </thead>
              <tbody>
                {byPlatform.map((r) => (
                  <tr key={r.platform} className="border-t border-neutral-100">
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
        ? `Scheduled for ${new Date(step.triggerScheduledAt).toLocaleString()}`
        : 'Root step'
      : step.triggerType === 'immediate'
        ? `Fires immediately after Step ${depIndex + 1} succeeds`
        : step.triggerType === 'delay'
          ? `Fires ${step.triggerDelayMinutes} minutes after Step ${depIndex + 1} succeeds`
          : `Fires at ${step.triggerScheduledAt ? new Date(step.triggerScheduledAt).toLocaleString() : 'scheduled time'}`

  const platformIcons = new Set<string>()
  for (const p of step.post?.platforms ?? []) platformIcons.add(p.platform)

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-neutral-900">Step {step.stepOrder + 1}</div>
              <div className="flex gap-0.5">
                {[...platformIcons].map((p) => (
                  <PlatformIcon key={p} platform={p as keyof typeof PLATFORMS} size={16} />
                ))}
              </div>
              {step.post ? <PostStatusBadge status={step.post.status} /> : null}
            </div>
            <div className="text-xs text-neutral-500">{triggerDesc}</div>
          </div>
          <div className="flex flex-wrap gap-1">
            {canTrigger ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void guarded(onTriggerNow)}
                disabled={busy}
              >
                <Zap className="h-3 w-3" /> Trigger now
              </Button>
            ) : null}
            {canSkip ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!confirm('Skip this step? Dependents will fire as if it succeeded.')) return
                  void guarded(onSkip)
                }}
                disabled={busy}
              >
                <SkipForward className="h-3 w-3" /> Skip
              </Button>
            ) : null}
            {step.post?.status === 'failed' ? (
              <Button size="sm" variant="outline" onClick={() => void guarded(onRetry)} disabled={busy}>
                <RotateCw className="h-3 w-3" /> Retry
              </Button>
            ) : null}
          </div>
        </div>

        {step.post ? (
          <div className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">
            {step.post.defaultContent || <span className="italic text-neutral-400">No content</span>}
          </div>
        ) : null}

        {step.post?.failureReason ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
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
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50"
              >
                <ExternalLink className="h-3 w-3" /> View
              </a>
            ))}
          </div>
        ) : null}

        {step.status === 'waiting' ? (
          <div className="text-xs text-neutral-500">
            Waiting for Step {depIndex + 1} to succeed
          </div>
        ) : null}
        {step.status === 'on_hold' ? (
          <div className="text-xs text-yellow-700">On hold — dependency failed or missed its window</div>
        ) : null}
      </div>
    </Card>
  )
}
