import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Search, Target, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { PostRow } from '~/components/posts/PostRow'
import { CampaignStatusBadge, PostStatusBadge } from '~/components/posts/badges'
import {
  listPosts,
  countsByStatus,
  listCampaigns,
  deletePosts,
  changeToDraft,
  type PostRow as Row,
  type PostsTab,
  type CampaignSummary,
  type CountsByStatus,
} from '~/server/posts'
import { PLATFORM_KEYS, PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { cn } from '~/lib/utils'

const TABS: { key: PostsTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'pending_approval', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
  { key: 'queue', label: 'Queue' },
]

export const Route = createFileRoute('/_dashboard/$workspaceSlug/posts/')({
  loader: async ({ params }) => {
    const [rows, counts, campaigns] = await Promise.all([
      listPosts({
        data: {
          workspaceSlug: params.workspaceSlug,
          tab: 'all',
          search: null,
          platforms: [],
          type: 'all',
          authorId: null,
          fromIso: null,
          toIso: null,
        },
      }),
      countsByStatus({ data: { workspaceSlug: params.workspaceSlug } }),
      listCampaigns({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    return { rows, counts, campaigns }
  },
  component: PostsPage,
})

function PostsPage() {
  const { workspaceSlug } = Route.useParams()
  const { workspace } = Route.useRouteContext()
  const userRole = workspace.role
  const initial = Route.useLoaderData()
  const [rows, setRows] = useState<Row[]>(initial.rows)
  const [counts, setCounts] = useState<CountsByStatus>(initial.counts)
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>(initial.campaigns)
  const [tab, setTab] = useState<PostsTab>('all')
  const [view, setView] = useState<'flat' | 'grouped'>('flat')
  const [search, setSearch] = useState('')
  const [type, setType] = useState<'all' | 'original' | 'reshare'>('all')
  const [platforms, setPlatforms] = useState<PlatformKey[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const [r, c, cs] = await Promise.all([
        listPosts({
          data: {
            workspaceSlug,
            tab,
            search: search || null,
            platforms,
            type,
            authorId: null,
            fromIso: null,
            toIso: null,
          },
        }),
        countsByStatus({ data: { workspaceSlug } }),
        listCampaigns({ data: { workspaceSlug } }),
      ])
      setRows(r)
      setCounts(c)
      setCampaigns(cs)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, type, platforms, search])

  const togglePlatform = (p: PlatformKey) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} post${selectedIds.size === 1 ? '' : 's'}?`)) return
    await deletePosts({ data: { workspaceSlug, postIds: [...selectedIds] } })
    setSelectedIds(new Set())
    await reload()
  }
  const bulkToDraft = async () => {
    await changeToDraft({ data: { workspaceSlug, postIds: [...selectedIds] } })
    setSelectedIds(new Set())
    await reload()
  }

  // For grouped view: standalone posts (no campaign) + campaign summaries
  const standalonePosts = rows.filter((r) => !r.campaignId)
  const onHoldCampaigns = campaigns.filter((c) => c.status === 'on_hold')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900">Posts</h2>
        </div>
        <div className="inline-flex rounded-md border border-neutral-200 bg-white p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView('flat')}
            className={cn('rounded px-2 py-1', view === 'flat' ? 'bg-neutral-900 text-white' : 'text-neutral-600')}
          >
            Flat
          </button>
          <button
            type="button"
            onClick={() => setView('grouped')}
            className={cn('rounded px-2 py-1', view === 'grouped' ? 'bg-neutral-900 text-white' : 'text-neutral-600')}
          >
            Grouped
          </button>
        </div>
      </div>

      {onHoldCampaigns.length > 0 ? (
        <div className="space-y-2">
          {onHoldCampaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-700" />
              <div className="flex-1">
                <div className="font-semibold text-yellow-900">&quot;{c.name}&quot; is on hold</div>
                <div className="text-yellow-800">
                  One or more steps failed or missed their scheduled window.
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link
                  to="/$workspaceSlug/posts/campaigns/$campaignId"
                  params={{ workspaceSlug, campaignId: c.id }}
                >
                  View Campaign
                </Link>
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium',
              tab === t.key
                ? 'border-b-2 border-indigo-500 text-indigo-600'
                : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            {t.label}
            <span className="rounded bg-neutral-100 px-1.5 text-xs text-neutral-600">
              {counts[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search content or source"
            className="pl-8"
          />
        </div>
        <div className="inline-flex rounded-md border border-neutral-200 bg-white p-0.5 text-xs">
          {(['all', 'original', 'reshare'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn('rounded px-2 py-1 capitalize', type === t ? 'bg-neutral-900 text-white' : 'text-neutral-600')}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {PLATFORM_KEYS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={cn(
                'rounded-full border p-0.5',
                platforms.includes(p) ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-transparent hover:border-neutral-200',
              )}
              title={PLATFORMS[p].label}
            >
              <PlatformIcon platform={p} size={18} />
            </button>
          ))}
        </div>
        {loading ? <Spinner /> : null}
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex items-center justify-between rounded-md border border-neutral-200 bg-white p-2 text-sm">
          <div>{selectedIds.size} selected</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={bulkToDraft}>
              Change to Draft
            </Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={bulkDelete}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      ) : null}

      {view === 'flat' ? (
        <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500">No posts.</div>
          ) : (
            rows.map((r) => (
              <PostRow
                key={r.id}
                post={r}
                workspaceSlug={workspaceSlug}
                selected={selectedIds.has(r.id)}
                onToggleSelect={toggleSelect}
                onChanged={reload}
                userRole={userRole}
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignGroupRow
              key={c.id}
              campaign={c}
              workspaceSlug={workspaceSlug}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onChanged={reload}
              userRole={userRole}
            />
          ))}
          {standalonePosts.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
              {standalonePosts.map((r) => (
                <PostRow
                  key={r.id}
                  post={r}
                  workspaceSlug={workspaceSlug}
                  selected={selectedIds.has(r.id)}
                  onToggleSelect={toggleSelect}
                  onChanged={reload}
                />
              ))}
            </div>
          ) : null}
          {campaigns.length === 0 && standalonePosts.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500">No posts.</div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function CampaignGroupRow({
  campaign,
  workspaceSlug,
  selectedIds,
  onToggleSelect,
  onChanged,
  userRole,
}: {
  campaign: CampaignSummary
  workspaceSlug: string
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onChanged: () => Promise<void>
  userRole: import('~/server/types').WorkspaceRole
}) {
  const [expanded, setExpanded] = useState(false)
  const published = campaign.steps.filter((s) => s.status === 'published').length
  const platformsInCampaign = new Set<PlatformKey>()
  for (const s of campaign.steps) {
    for (const t of s.post?.platforms ?? []) platformsInCampaign.add(t.platform)
  }

  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="rounded p-0.5 text-neutral-500 hover:bg-neutral-100"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Target className="h-5 w-5 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/$workspaceSlug/posts/campaigns/$campaignId"
              params={{ workspaceSlug, campaignId: campaign.id }}
              className="text-sm font-semibold text-neutral-900 hover:underline"
            >
              {campaign.name}
            </Link>
            <CampaignStatusBadge status={campaign.status} />
            <span className="text-xs text-neutral-500">
              {published}/{campaign.steps.length} done
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
            <span>{campaign.steps.length} steps ·</span>
            <div className="flex gap-0.5">
              {[...platformsInCampaign].slice(0, 6).map((p) => (
                <PlatformIcon key={p} platform={p} size={14} />
              ))}
            </div>
          </div>
        </div>
      </div>
      {expanded ? (
        <div className="border-t border-neutral-100">
          {campaign.steps.map((s) =>
            s.post ? (
              <div key={s.id}>
                <div className="flex items-center gap-2 px-12 pt-3 text-xs text-neutral-500">
                  <span className="font-semibold text-neutral-700">Step {s.stepOrder + 1}</span>
                  <PostStatusBadge status={s.post.status} />
                  {s.triggerType === 'delay' ? (
                    <span>delay {s.triggerDelayMinutes}m after step {campaign.steps.findIndex((x) => x.id === s.dependsOnStepId) + 1}</span>
                  ) : s.triggerType === 'immediate' ? (
                    <span>immediately after step {campaign.steps.findIndex((x) => x.id === s.dependsOnStepId) + 1}</span>
                  ) : null}
                </div>
                <PostRow
                  post={s.post}
                  workspaceSlug={workspaceSlug}
                  selected={selectedIds.has(s.post.id)}
                  onToggleSelect={onToggleSelect}
                  onChanged={onChanged}
                  indent
                  userRole={userRole}
                />
              </div>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  )
}
