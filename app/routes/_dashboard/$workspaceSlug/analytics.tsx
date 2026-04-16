import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { ArrowDown, ArrowUp, Download, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'
import {
  getSummary,
  getFollowerSeries,
  getDailyEngagements,
  getPlatformTable,
  getTopPosts,
  getBestPostingTimes,
  listAccountsForAnalytics,
  syncAnalyticsNow,
  type AnalyticsRange,
  type AnalyticsSummary,
  type FollowerPoint,
  type DailyEngagementRow,
  type PlatformTableRow,
  type TopPostRow,
  type HeatmapRow,
  type AccountOption,
} from '~/server/analytics'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/analytics')({
  loader: async ({ params }) => {
    const workspaceSlug = params.workspaceSlug
    const range: AnalyticsRange = '30d'
    const [accounts, summary, followers, engagements, platformTable, topPosts, heatmap] =
      await Promise.all([
        listAccountsForAnalytics({ data: { workspaceSlug } }),
        getSummary({ data: { workspaceSlug, range, accountId: null } }),
        getFollowerSeries({ data: { workspaceSlug, range, accountId: null } }),
        getDailyEngagements({ data: { workspaceSlug, range, accountId: null } }),
        getPlatformTable({ data: { workspaceSlug, range } }),
        getTopPosts({ data: { workspaceSlug, range } }),
        getBestPostingTimes({ data: { workspaceSlug, range } }),
      ])
    return { accounts, summary, followers, engagements, platformTable, topPosts, heatmap }
  },
  component: AnalyticsPage,
})

function SyncNowButton({ workspaceSlug }: { workspaceSlug: string }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const trigger = async () => {
    setBusy(true)
    try {
      await syncAnalyticsNow({ data: { workspaceSlug } })
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    } catch (e) {
      alert(e instanceof Error ? e.message : t('analytics.failedToSync'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button size="sm" variant="ghost" onClick={trigger} disabled={busy} title="Run analytics sync now">
      <RefreshCw className={cn('h-4 w-4', busy ? 'animate-spin' : '')} />
      {done ? t('analytics.queued') : t('analytics.sync')}
    </Button>
  )
}

function DownloadReportButton({
  workspaceSlug,
  range,
  accountId,
  customFrom,
  customTo,
}: {
  workspaceSlug: string
  range: AnalyticsRange
  accountId: string | null
  customFrom: string
  customTo: string
}) {
  const t = useT()
  const download = () => {
    const params = new URLSearchParams({ workspaceSlug, range })
    if (accountId) params.set('accountId', accountId)
    if (range === 'custom') {
      params.set('fromIso', new Date(`${customFrom}T00:00:00`).toISOString())
      params.set('toIso', new Date(`${customTo}T23:59:59`).toISOString())
    }
    window.location.href = `/api/reports/analytics?${params.toString()}`
  }
  return (
    <Button size="sm" variant="outline" onClick={download}>
      <Download className="h-4 w-4" />
      {t('analytics.downloadReport')}
    </Button>
  )
}

function AnalyticsPage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState({
    summary: initial.summary,
    followers: initial.followers,
    engagements: initial.engagements,
    platformTable: initial.platformTable,
    topPosts: initial.topPosts,
    heatmap: initial.heatmap,
  })

  const reload = async () => {
    setLoading(true)
    const customDates =
      range === 'custom'
        ? {
            fromIso: new Date(`${customFrom}T00:00:00`).toISOString(),
            toIso: new Date(`${customTo}T23:59:59`).toISOString(),
          }
        : {}
    try {
      const [summary, followers, engagements, platformTable, topPosts, heatmap] =
        await Promise.all([
          getSummary({ data: { workspaceSlug, range, accountId, ...customDates } }),
          getFollowerSeries({ data: { workspaceSlug, range, accountId, ...customDates } }),
          getDailyEngagements({ data: { workspaceSlug, range, accountId, ...customDates } }),
          getPlatformTable({ data: { workspaceSlug, range, ...customDates } }),
          getTopPosts({ data: { workspaceSlug, range, ...customDates } }),
          getBestPostingTimes({ data: { workspaceSlug, range, ...customDates } }),
        ])
      setData({ summary, followers, engagements, platformTable, topPosts, heatmap })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, accountId, customFrom, customTo])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{t('analytics.title')}</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('analytics.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeToggle value={range} onChange={setRange} />
          {range === 'custom' ? (
            <div className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2"
              />
              <span>→</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2"
              />
            </div>
          ) : null}
          <AccountFilter
            accounts={initial.accounts}
            value={accountId}
            onChange={setAccountId}
          />
          <DownloadReportButton workspaceSlug={workspaceSlug} range={range} accountId={accountId} customFrom={customFrom} customTo={customTo} />
          <SyncNowButton workspaceSlug={Route.useParams().workspaceSlug} />
          {loading ? <Spinner /> : null}
        </div>
      </div>

      <SummaryCards summary={data.summary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t('analytics.followerGrowth')}>
          <FollowerChart data={data.followers} accounts={initial.accounts} />
        </ChartCard>
        <ChartCard title={t('analytics.dailyEngagements')}>
          <DailyBars data={data.engagements} />
        </ChartCard>
        <ChartCard title={t('analytics.engagementBreakdown')}>
          <EngagementPie summary={data.summary} />
        </ChartCard>
        <ChartCard title={t('analytics.bestPostingTimes')}>
          <Heatmap data={data.heatmap} />
        </ChartCard>
      </div>

      <Card>
        <div className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('analytics.perPlatform')}</h3>
          <PlatformTable rows={data.platformTable} />
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('analytics.topPosts')}</h3>
          <TopPosts rows={data.topPosts} />
        </div>
      </Card>
    </div>
  )
}

// ---------------- subcomponents ---------------------------------------------

const RANGE_LABELS = {
  '7d': 'analytics.range7d',
  '30d': 'analytics.range30d',
  '90d': 'analytics.range90d',
  'custom': 'analytics.rangeCustom',
} as const

function RangeToggle({
  value,
  onChange,
}: {
  value: AnalyticsRange
  onChange: (r: AnalyticsRange) => void
}) {
  const t = useT()
  return (
    <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-xs">
      {(['7d', '30d', '90d', 'custom'] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={cn(
            'rounded px-2 py-1',
            value === r ? 'bg-neutral-900 text-white' : 'text-neutral-600 dark:text-neutral-300',
          )}
        >
          {t(RANGE_LABELS[r])}
        </button>
      ))}
    </div>
  )
}

function AccountFilter({
  accounts,
  value,
  onChange,
}: {
  accounts: AccountOption[]
  value: string | null
  onChange: (v: string | null) => void
}) {
  const t = useT()
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-8 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 text-xs"
    >
      <option value="">{t('analytics.allAccounts')}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {PLATFORMS[a.platform].label} · @{a.accountHandle}
        </option>
      ))}
    </select>
  )
}

function SummaryCards({ summary }: { summary: AnalyticsSummary }) {
  const t = useT()
  const items: Array<{ label: string; value: string; delta: number }> = [
    { label: t('analytics.posts'), value: summary.totalPosts.toLocaleString(), delta: summary.delta.totalPosts },
    { label: t('analytics.reshares'), value: summary.totalReshares.toLocaleString(), delta: summary.delta.totalReshares },
    { label: t('analytics.reach'), value: summary.totalReach.toLocaleString(), delta: summary.delta.totalReach },
    { label: t('analytics.engagements'), value: summary.totalEngagements.toLocaleString(), delta: summary.delta.totalEngagements },
    {
      label: t('analytics.engagementRate'),
      value: `${summary.avgEngagementRate.toFixed(1)}%`,
      delta: summary.delta.avgEngagementRate,
    },
    {
      label: t('analytics.followerGrowth'),
      value: summary.followerGrowth.toLocaleString(),
      delta: summary.delta.followerGrowth,
    },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {items.map((i) => (
        <Card key={i.label}>
          <div className="space-y-1 p-3">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{i.label}</div>
            <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{i.value}</div>
            <DeltaBadge delta={i.delta} />
          </div>
        </Card>
      ))}
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  if (!isFinite(delta) || delta === 0) {
    return <div className="text-[11px] text-neutral-500 dark:text-neutral-400">—</div>
  }
  const up = delta > 0
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium',
        up ? 'text-green-600' : 'text-red-600',
      )}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta).toFixed(0)}%
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="space-y-2 p-4">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
        <div className="h-64">{children}</div>
      </div>
    </Card>
  )
}

function FollowerChart({
  data,
  accounts,
}: {
  data: FollowerPoint[]
  accounts: AccountOption[]
}) {
  const t = useT()
  if (data.length === 0) return <EmptyState label={t('analytics.noFollowerSnapshots')} />
  const series = accounts.map((a) => ({
    id: a.id,
    label: `@${a.accountHandle}`,
    color: PLATFORMS[a.platform].color,
    points: data.map((d) => ({ date: d.date, value: d.byAccount[a.id] ?? null })),
  }))
  // Recharts wants shape: [{ date, acct1: n, acct2: n, ... }]
  const rows = data.map((d) => {
    const row: Record<string, string | number | null> = { date: d.date }
    for (const a of accounts) row[a.id] = d.byAccount[a.id] ?? null
    return row
  })
  return (
    <ResponsiveContainer>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="date" fontSize={10} />
        <YAxis fontSize={10} />
        <Tooltip />
        <Legend />
        {series.map((s) => (
          <Line
            key={s.id}
            type="monotone"
            dataKey={s.id}
            stroke={s.color}
            dot={false}
            name={s.label}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function DailyBars({ data }: { data: DailyEngagementRow[] }) {
  const t = useT()
  if (data.length === 0) return <EmptyState label={t('analytics.noEngagementData')} />
  return (
    <ResponsiveContainer>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="date" fontSize={10} />
        <YAxis fontSize={10} />
        <Tooltip />
        <Legend />
        <Bar dataKey="likes" stackId="e" fill="#ef4444" />
        <Bar dataKey="comments" stackId="e" fill="#6366f1" />
        <Bar dataKey="shares" stackId="e" fill="#22c55e" />
        <Bar dataKey="clicks" stackId="e" fill="#f59e0b" />
      </BarChart>
    </ResponsiveContainer>
  )
}

function EngagementPie({ summary }: { summary: AnalyticsSummary }) {
  // We only have totals on the summary, not per-category, so approximate from
  // the daily engagements series when present. For a simple always-working
  // pie, return totalEngagements as a single slice when empty.
  const t = useT()
  if (summary.totalEngagements === 0) return <EmptyState label={t('analytics.noEngagementsYet')} />
  const data = [
    { name: t('analytics.engagements'), value: summary.totalEngagements },
  ]
  const COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b']
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie
          data={data}
          innerRadius={50}
          outerRadius={90}
          dataKey="value"
          nameKey="name"
          label
        >
          {data.map((_d, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// heatmap uses JS Date.getDay: 0 = Sunday through 6 = Saturday.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function Heatmap({ data }: { data: HeatmapRow[] }) {
  const t = useT()
  if (data.length === 0) return <EmptyState label={t('analytics.noPostsInWindow')} />
  const max = Math.max(...data.map((d) => d.posts), 1)
  const get = (d: number, h: number) => data.find((r) => r.dayOfWeek === d && r.hour === h)

  return (
    <div className="h-full overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: '32px repeat(24, minmax(12px, 1fr))' }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="pb-1 text-center text-[9px] text-neutral-400 dark:text-neutral-500">
            {h % 3 === 0 ? h : ''}
          </div>
        ))}
        {DAY_ORDER.map((d, di) => (
          <>
            <div key={`l${d}`} className="pr-1 text-right text-[10px] text-neutral-500 dark:text-neutral-400">
              {DAY_LABELS[di]}
            </div>
            {Array.from({ length: 24 }, (_, h) => {
              const c = get(d, h)
              const intensity = c ? c.posts / max : 0
              return (
                <div
                  key={`${d}-${h}`}
                  title={c ? `${DAY_LABELS[di]} ${h}:00 · ${c.posts} post${c.posts === 1 ? '' : 's'}` : ''}
                  className="h-5 rounded-sm border border-white/0"
                  style={{
                    backgroundColor: `rgba(99,102,241,${0.05 + intensity * 0.85})`,
                  }}
                />
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}

function PlatformTable({ rows }: { rows: PlatformTableRow[] }) {
  const t = useT()
  if (rows.length === 0) return <EmptyState label={t('analytics.noConnectedAccounts')} />
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          <tr className="border-b border-neutral-100 dark:border-neutral-800">
            <th className="px-2 py-1.5">Platform</th>
            <th className="px-2 py-1.5">Account</th>
            <th className="px-2 py-1.5">Posts</th>
            <th className="px-2 py-1.5">Reshares</th>
            <th className="px-2 py-1.5">Reach</th>
            <th className="px-2 py-1.5">Impr.</th>
            <th className="px-2 py-1.5">Likes</th>
            <th className="px-2 py-1.5">Comm.</th>
            <th className="px-2 py-1.5">Shares</th>
            <th className="px-2 py-1.5">Clicks</th>
            <th className="px-2 py-1.5">Eng. rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.accountId} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
              <td className="px-2 py-2">
                <div className="flex items-center gap-1.5">
                  <PlatformIcon platform={r.platform as PlatformKey} size={14} />
                  {PLATFORMS[r.platform as PlatformKey].label}
                </div>
              </td>
              <td className="px-2 py-2 text-neutral-600 dark:text-neutral-300">@{r.accountHandle}</td>
              <td className="px-2 py-2">{r.posts}</td>
              <td className="px-2 py-2">{r.reshares}</td>
              <td className="px-2 py-2">{r.reach}</td>
              <td className="px-2 py-2">{r.impressions}</td>
              <td className="px-2 py-2">{r.likes}</td>
              <td className="px-2 py-2">{r.comments}</td>
              <td className="px-2 py-2">{r.shares}</td>
              <td className="px-2 py-2">{r.clicks}</td>
              <td className="px-2 py-2">{r.engagementRate.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TopPosts({ rows }: { rows: TopPostRow[] }) {
  const t = useT()
  if (rows.length === 0) return <EmptyState label={t('analytics.noPostsInWindow')} />
  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {rows.map((p) => (
        <div key={p.id} className="flex items-start gap-3 py-2">
          <div className="h-10 w-10 shrink-0 rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-sm text-neutral-900 dark:text-neutral-100">
              {p.content || <span className="italic text-neutral-400 dark:text-neutral-500">{t('approvals.noContent')}</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
              {p.platforms.map((pl) => (
                <PlatformIcon key={pl} platform={pl} size={12} />
              ))}
              <span>
                👍 {p.likes} · 💬 {p.comments} · 🔁 {p.shares} · 🔗 {p.clicks}
              </span>
            </div>
          </div>
          {p.publishedUrl ? (
            <a
              href={p.publishedUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> {t('analytics.view')}
            </a>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
      {label}
    </div>
  )
}
