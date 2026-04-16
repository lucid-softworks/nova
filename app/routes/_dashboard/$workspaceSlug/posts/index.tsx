import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Download, MoreHorizontal, Pause, Search, Target, Trash2, Upload, X } from 'lucide-react'
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
  pauseCampaign,
  cancelCampaign,
  duplicateCampaign,
  type PostRow as Row,
  type PostsTab,
  type CampaignSummary,
  type CountsByStatus,
} from '~/server/posts'
import { importPostsFromCsv, type ImportReport } from '~/server/csv'
import { listMembers, type MemberRow } from '~/server/team'
import { listAccounts, type AccountSummary } from '~/server/accounts'
import { listRecurring, type RecurringRow } from '~/server/recurring'
import { PLATFORM_KEYS, PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'

const TAB_KEYS = [
  { key: 'all', i18nKey: 'posts.all' },
  { key: 'scheduled', i18nKey: 'posts.scheduled' },
  { key: 'published', i18nKey: 'posts.published' },
  { key: 'drafts', i18nKey: 'posts.drafts' },
  { key: 'pending_approval', i18nKey: 'posts.pending' },
  { key: 'failed', i18nKey: 'posts.failed' },
  { key: 'queue', i18nKey: 'posts.queue' },
] as const

export const Route = createFileRoute('/_dashboard/$workspaceSlug/posts/')({
  loader: async ({ params }) => {
    const [rows, counts, campaigns, members, accounts, recurringRules] = await Promise.all([
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
      listMembers({ data: { workspaceSlug: params.workspaceSlug } }),
      listAccounts({ data: { workspaceSlug: params.workspaceSlug } }),
      listRecurring({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    return { rows, counts, campaigns, members, accounts, recurringRules }
  },
  component: PostsPage,
})

function PostsPage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const { workspace } = Route.useRouteContext()
  const userRole = workspace.role
  const initial = Route.useLoaderData()
  const [rows, setRows] = useState<Row[]>(initial.rows)
  const [counts, setCounts] = useState<CountsByStatus>(initial.counts)
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>(initial.campaigns)
  const members: MemberRow[] = initial.members
  const accounts: AccountSummary[] = initial.accounts
  const [recurringRules, setRecurringRules] = useState<RecurringRow[]>(initial.recurringRules)
  const recurringPostIds = new Set(recurringRules.map((r) => r.sourcePostId))
  const [tab, setTab] = useState<PostsTab>('all')
  const [view, setView] = useState<'flat' | 'grouped'>('flat')
  const [search, setSearch] = useState('')
  const [type, setType] = useState<'all' | 'original' | 'reshare'>('all')
  const [platforms, setPlatforms] = useState<PlatformKey[]>([])
  const [authorId, setAuthorId] = useState<string>('')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const [r, c, cs, rr] = await Promise.all([
        listPosts({
          data: {
            workspaceSlug,
            tab,
            search: search || null,
            platforms,
            type,
            authorId: authorId || null,
            fromIso: fromDate ? new Date(fromDate).toISOString() : null,
            toIso: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null,
          },
        }),
        countsByStatus({ data: { workspaceSlug } }),
        listCampaigns({ data: { workspaceSlug } }),
        listRecurring({ data: { workspaceSlug } }),
      ])
      setRows(r)
      setCounts(c)
      setCampaigns(cs)
      setRecurringRules(rr)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, type, platforms, search, authorId, fromDate, toDate])

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
    if (!confirm(t('posts.deletePosts', { count: selectedIds.size }))) return
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
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{t('posts.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <CsvButtons
            workspaceSlug={workspaceSlug}
            onImported={reload}
            exportParams={{
              tab,
              search,
              platforms,
              type,
              authorId,
              fromDate,
              toDate,
            }}
          />
          <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView('flat')}
              className={cn(
                'rounded px-2 py-1',
                view === 'flat' ? 'bg-neutral-900 text-white' : 'text-neutral-600 dark:text-neutral-300',
              )}
            >
              {t('posts.flat')}
            </button>
            <button
              type="button"
              onClick={() => setView('grouped')}
              className={cn(
                'rounded px-2 py-1',
                view === 'grouped' ? 'bg-neutral-900 text-white' : 'text-neutral-600 dark:text-neutral-300',
              )}
            >
              {t('posts.grouped')}
            </button>
          </div>
        </div>
      </div>

      {onHoldCampaigns.length > 0 ? (
        <div className="space-y-2">
          {onHoldCampaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/40 p-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-700" />
              <div className="flex-1">
                <div className="font-semibold text-yellow-900">{t('posts.isOnHold', { name: c.name })}</div>
                <div className="text-yellow-800">
                  {t('posts.stepsFailedOrMissedDesc')}
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link
                  to="/$workspaceSlug/posts/campaigns/$campaignId"
                  params={{ workspaceSlug, campaignId: c.id }}
                >
                  {t('posts.viewCampaignBtn')}
                </Link>
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TAB_KEYS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium',
              tab === tb.key
                ? 'border-b-2 border-indigo-500 text-indigo-600'
                : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900',
            )}
          >
            {t(tb.i18nKey)}
            <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 text-xs text-neutral-600 dark:text-neutral-300">
              {counts[tb.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('posts.searchContentOrSource')}
            className="pl-8"
          />
        </div>
        <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-xs">
          {(['all', 'original', 'reshare'] as const).map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setType(tp)}
              className={cn('rounded px-2 py-1 capitalize', type === tp ? 'bg-neutral-900 text-white' : 'text-neutral-600 dark:text-neutral-300')}
            >
              {tp === 'all' ? t('posts.all') : tp === 'original' ? t('posts.original') : t('posts.reshare')}
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
        <select
          value={authorId}
          onChange={(e) => setAuthorId(e.target.value)}
          className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
          title="Filter by author"
        >
          <option value="">{t('posts.allAuthors')}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name || m.email}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
          <span>{t('posts.from')}</span>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-7 w-[140px] text-xs"
          />
          <span>{t('posts.to')}</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-7 w-[140px] text-xs"
          />
          {fromDate || toDate ? (
            <button
              type="button"
              onClick={() => {
                setFromDate('')
                setToDate('')
              }}
              className="rounded px-1 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title="Clear dates"
            >
              ×
            </button>
          ) : null}
        </div>
        {loading ? <Spinner /> : null}
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex items-center justify-between rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2 text-sm">
          <div>{t('media.selected', { count: selectedIds.size })}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={bulkToDraft}>
              {t('posts.changeToDraftBtn')}
            </Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={bulkDelete}>
              <Trash2 className="h-4 w-4" /> {t('common.delete')}
            </Button>
          </div>
        </div>
      ) : null}

      {view === 'flat' ? (
        <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">{t('posts.noPosts')}</div>
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
                accounts={accounts}
                hasRecurringRule={recurringPostIds.has(r.id)}
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
              accounts={accounts}
              recurringPostIds={recurringPostIds}
            />
          ))}
          {standalonePosts.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              {standalonePosts.map((r) => (
                <PostRow
                  key={r.id}
                  post={r}
                  workspaceSlug={workspaceSlug}
                  selected={selectedIds.has(r.id)}
                  onToggleSelect={toggleSelect}
                  onChanged={reload}
                  accounts={accounts}
                  hasRecurringRule={recurringPostIds.has(r.id)}
                />
              ))}
            </div>
          ) : null}
          {campaigns.length === 0 && standalonePosts.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">{t('posts.noPosts')}</div>
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
  accounts,
  recurringPostIds,
}: {
  campaign: CampaignSummary
  workspaceSlug: string
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onChanged: () => Promise<void>
  userRole: import('~/server/types').WorkspaceRole
  accounts: AccountSummary[]
  recurringPostIds: Set<string>
}) {
  const [expanded, setExpanded] = useState(false)
  const published = campaign.steps.filter((s) => s.status === 'published').length
  const platformsInCampaign = new Set<PlatformKey>()
  for (const s of campaign.steps) {
    for (const t of s.post?.platforms ?? []) platformsInCampaign.add(t.platform)
  }

  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="rounded p-0.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Target className="h-5 w-5 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/$workspaceSlug/posts/campaigns/$campaignId"
              params={{ workspaceSlug, campaignId: campaign.id }}
              className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:underline"
            >
              {campaign.name}
            </Link>
            <CampaignStatusBadge status={campaign.status} />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {published}/{campaign.steps.length} done
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{campaign.steps.length} steps ·</span>
            <div className="flex gap-0.5">
              {[...platformsInCampaign].slice(0, 6).map((p) => (
                <PlatformIcon key={p} platform={p} size={14} />
              ))}
            </div>
          </div>
        </div>
        <CampaignActionsMenu
          campaign={campaign}
          workspaceSlug={workspaceSlug}
          onChanged={onChanged}
        />
      </div>
      {expanded ? (
        <div className="border-t border-neutral-100 dark:border-neutral-800">
          {campaign.steps.map((s) =>
            s.post ? (
              <div key={s.id}>
                <div className="flex items-center gap-2 px-12 pt-3 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-200">Step {s.stepOrder + 1}</span>
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
                  accounts={accounts}
                  hasRecurringRule={recurringPostIds.has(s.post.id)}
                />
              </div>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  )
}

function CampaignActionsMenu({
  campaign,
  workspaceSlug,
  onChanged,
}: {
  campaign: CampaignSummary
  workspaceSlug: string
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const terminal = campaign.status === 'published' || campaign.status === 'cancelled'
  const pauseable = !terminal && campaign.status !== 'paused'

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      setOpen(false)
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded p-1 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        aria-label="Campaign actions"
        disabled={busy}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-10 mt-1 w-52 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1 text-sm shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            onClick={() =>
              run(() =>
                pauseCampaign({ data: { workspaceSlug, campaignId: campaign.id } }),
              )
            }
            disabled={busy || !pauseable}
          >
            <Pause className="h-3 w-3" /> {t('posts.pauseCampaign')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
            onClick={() => {
              if (!confirm(t('posts.cancelCampaignConfirm', { name: campaign.name }))) return
              void run(() =>
                cancelCampaign({ data: { workspaceSlug, campaignId: campaign.id } }),
              )
            }}
            disabled={busy || terminal}
          >
            <X className="h-3 w-3" /> {t('posts.cancelCampaign')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            onClick={() =>
              run(() =>
                duplicateCampaign({ data: { workspaceSlug, campaignId: campaign.id } }),
              )
            }
            disabled={busy}
          >
            <Copy className="h-3 w-3" /> {t('posts.duplicateCampaign')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function CsvButtons({
  workspaceSlug,
  onImported,
  exportParams,
}: {
  workspaceSlug: string
  onImported: () => void
  exportParams: {
    tab: PostsTab
    search: string
    platforms: PlatformKey[]
    type: 'all' | 'original' | 'reshare'
    authorId: string
    fromDate: string
    toDate: string
  }
}) {
  const t = useT()
  const [busy, setBusy] = useState<'import' | 'export' | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy('import')
    try {
      const csvText = await f.text()
      const r = await importPostsFromCsv({ data: { workspaceSlug, csvText } })
      setReport(r)
      onImported()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(null)
    }
  }

  const exportNow = () => {
    setBusy('export')
    const params = new URLSearchParams({
      workspaceSlug,
      tab: exportParams.tab,
      search: exportParams.search ?? '',
      platforms: exportParams.platforms.join(','),
      type: exportParams.type,
    })
    if (exportParams.authorId) params.set('authorId', exportParams.authorId)
    if (exportParams.fromDate) {
      params.set('fromIso', new Date(`${exportParams.fromDate}T00:00:00`).toISOString())
    }
    if (exportParams.toDate) {
      params.set('toIso', new Date(`${exportParams.toDate}T23:59:59`).toISOString())
    }
    window.location.href = `/api/posts/export?${params.toString()}`
    setTimeout(() => setBusy(null), 1500)
  }

  return (
    <div className="flex items-center gap-1">
      <label
        className={cn(
          'inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-900 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800',
          busy !== null && 'pointer-events-none opacity-50',
        )}
        title="Import posts from CSV"
      >
        {busy === 'import' ? <Spinner /> : <Upload className="h-3 w-3" />} {t('posts.importBtn')}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      </label>
      <Button
        size="sm"
        variant="outline"
        onClick={exportNow}
        disabled={busy !== null}
        title="Export current list"
      >
        {busy === 'export' ? <Spinner /> : <Download className="h-3 w-3" />} {t('posts.exportBtn')}
      </Button>
      {report ? (
        <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
          {t('posts.createdAndSkipped', { created: report.created, skipped: report.skipped })}
        </span>
      ) : null}
    </div>
  )
}
