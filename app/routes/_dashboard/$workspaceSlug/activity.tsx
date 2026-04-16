import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { listMembers, type MemberRow } from '~/server/team'
import { listWorkspaceActivity, type WorkspaceActivityRow } from '~/server/posts'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/activity')({
  loader: async ({ params }) => {
    const [activity, members] = await Promise.all([
      listWorkspaceActivity({ data: { workspaceSlug: params.workspaceSlug } }),
      listMembers({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    return { activity, members }
  },
  component: ActivityPage,
})

const ACTION_LABELS: Record<string, string> = {
  created: 'created',
  updated: 'edited',
  scheduled: 'scheduled',
  published: 'published',
  cancelled: 'cancelled',
  approved: 'approved',
  rejected: 'rejected',
  deleted: 'deleted',
  retried: 'retried',
  failed: 'failed',
  edited: 'edited',
}

function labelFor(action: string): string {
  return ACTION_LABELS[action] ?? action
}

function isoForDate(d: string, endOfDay = false): string | null {
  if (!d) return null
  const time = endOfDay ? 'T23:59:59' : 'T00:00:00'
  const dt = new Date(`${d}${time}`)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

function ActivityPage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData() as {
    activity: WorkspaceActivityRow[]
    members: MemberRow[]
  }
  const [activity, setActivity] = useState<WorkspaceActivityRow[]>(initial.activity)
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listWorkspaceActivity({
      data: {
        workspaceSlug,
        fromIso: isoForDate(fromDate) ?? null,
        toIso: isoForDate(toDate, true) ?? null,
        userId: userId || null,
      },
    })
      .then((next) => {
        if (!cancelled) setActivity(next)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceSlug, fromDate, toDate, userId])

  const exportUrl = (format: 'csv' | 'json') => {
    const params = new URLSearchParams({ workspaceSlug, format })
    const from = isoForDate(fromDate)
    const to = isoForDate(toDate, true)
    if (from) params.set('fromIso', from)
    if (to) params.set('toIso', to)
    if (userId) params.set('userId', userId)
    return `/api/activity/export?${params.toString()}`
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {t('activity.title')}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('activity.recentChanges')}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-neutral-600 dark:text-neutral-300">
            {t('activity.from')}
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-0.5 h-8"
            />
          </label>
          <label className="text-xs text-neutral-600 dark:text-neutral-300">
            {t('activity.to')}
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-0.5 h-8"
            />
          </label>
          <label className="text-xs text-neutral-600 dark:text-neutral-300">
            {t('activity.actor')}
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-0.5 h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
              <option value="">{t('activity.everyone')}</option>
              {initial.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <Button asChild size="sm" variant="outline">
            <a href={exportUrl('csv')}>
              <Download className="h-3 w-3" /> {t('activity.csvExport')}
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={exportUrl('json')}>
              <Download className="h-3 w-3" /> {t('activity.jsonExport')}
            </a>
          </Button>
        </div>
      </div>
      <Card>
        {loading ? (
          <p className="p-4 text-sm text-neutral-500 dark:text-neutral-400">{t('activity.loading')}</p>
        ) : activity.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
            {t('activity.noMatchingActivity')}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="text-neutral-900 dark:text-neutral-100">
                    <span className="font-medium">{a.userName ?? 'Someone'}</span>{' '}
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {labelFor(a.action)}
                    </span>{' '}
                    <Link
                      to="/$workspaceSlug/compose"
                      params={{ workspaceSlug }}
                      search={{ postId: a.postId } as never}
                      className="text-indigo-600 hover:underline"
                    >
                      {t('activity.aPost')}
                    </Link>
                    {a.note ? (
                      <span className="text-neutral-500 dark:text-neutral-400">
                        {' '}
                        — {a.note}
                      </span>
                    ) : null}
                  </div>
                  {a.postContent ? (
                    <div className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      “{a.postContent}”
                    </div>
                  ) : null}
                </div>
                <time className="whitespace-nowrap text-xs text-neutral-400 dark:text-neutral-500">
                  {new Date(a.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
