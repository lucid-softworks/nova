import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Eye, Plus, Radar, Trash2 } from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { useConfirm } from '~/components/ui/confirm'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import {
  listMonitorWatches,
  listMonitorMatches,
  createMonitorWatch,
  toggleMonitorWatch,
  deleteMonitorWatch,
  markMonitorMatchRead,
  markAllMonitorMatchesRead,
  type KeywordWatchRow,
  type KeywordMatchRow,
} from '~/server/monitors'
import { cn } from '~/lib/utils'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/monitors')({
  loader: async ({ params }) => {
    const [watches, matches] = await Promise.all([
      listMonitorWatches({ data: { workspaceSlug: params.workspaceSlug } }),
      listMonitorMatches({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    return { watches, matches }
  },
  component: MonitorsPage,
})

function MonitorsPage() {
  const confirm = useConfirm()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const [watches, setWatches] = useState<KeywordWatchRow[]>(initial.watches)
  const [matches, setMatches] = useState<KeywordMatchRow[]>(initial.matches)
  const [selectedWatchId, setSelectedWatchId] = useState<string | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [addTerm, setAddTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = async () => {
    const [w, m] = await Promise.all([
      listMonitorWatches({ data: { workspaceSlug } }),
      listMonitorMatches({
        data: {
          workspaceSlug,
          watchId: selectedWatchId ?? undefined,
          unreadOnly: unreadOnly || undefined,
        },
      }),
    ])
    setWatches(w)
    setMatches(m)
  }

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addTerm.trim()) return
    setAdding(true)
    try {
      await createMonitorWatch({
        data: { workspaceSlug, term: addTerm.trim(), platform: 'bluesky' },
      })
      setAddTerm('')
      await reload()
    } finally {
      setAdding(false)
    }
  }

  const onToggle = async (w: KeywordWatchRow) => {
    setBusy(w.id)
    try {
      await toggleMonitorWatch({
        data: { workspaceSlug, watchId: w.id, enabled: !w.enabled },
      })
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const onDelete = async (w: KeywordWatchRow) => {
    const ok = await confirm({
      message: `Stop watching "${w.term}"? Existing matches will be deleted.`,
      destructive: true,
      confirmLabel: 'Stop watching',
    })
    if (!ok) return
    setBusy(w.id)
    try {
      await deleteMonitorWatch({ data: { workspaceSlug, watchId: w.id } })
      if (selectedWatchId === w.id) setSelectedWatchId(null)
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const onMarkRead = async (m: KeywordMatchRow) => {
    setMatches((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)))
    await markMonitorMatchRead({ data: { workspaceSlug, matchId: m.id } })
    await reload()
  }

  const onMarkAllRead = async () => {
    await markAllMonitorMatchesRead({
      data: { workspaceSlug, watchId: selectedWatchId ?? undefined },
    })
    await reload()
  }

  const changeFilter = async (watchId: string | null, unread: boolean) => {
    setSelectedWatchId(watchId)
    setUnreadOnly(unread)
    const m = await listMonitorMatches({
      data: {
        workspaceSlug,
        watchId: watchId ?? undefined,
        unreadOnly: unread || undefined,
      },
    })
    setMatches(m)
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-indigo-500" />
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Mention monitors
          </h2>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Track keywords across Bluesky. Checked every 10 minutes.
        </p>
      </div>

      <Card>
        <form onSubmit={onAdd} className="flex items-end gap-2 p-3">
          <div className="flex-1">
            <label htmlFor="term" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              New keyword or phrase
            </label>
            <Input
              id="term"
              value={addTerm}
              onChange={(e) => setAddTerm(e.target.value)}
              placeholder='e.g. "nova app" or skeduleit'
              maxLength={200}
            />
          </div>
          <Button type="submit" disabled={adding || !addTerm.trim()}>
            {adding ? <Spinner /> : <Plus className="h-4 w-4" />}
            Track
          </Button>
        </form>
      </Card>

      {watches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2 md:col-span-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Watches
            </div>
            <Card>
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => changeFilter(null, unreadOnly)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800',
                    selectedWatchId === null && 'bg-neutral-100 dark:bg-neutral-800',
                  )}
                >
                  <span className="text-neutral-900 dark:text-neutral-100">All watches</span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {watches.reduce((n, w) => n + w.unreadCount, 0)} unread
                  </span>
                </button>
                {watches.map((w) => (
                  <div
                    key={w.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-md px-1 py-1',
                      selectedWatchId === w.id && 'bg-neutral-100 dark:bg-neutral-800',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => changeFilter(w.id, unreadOnly)}
                      className="flex flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <PlatformIcon platform={w.platform as 'bluesky'} size={14} />
                      <span
                        className={cn(
                          'flex-1 truncate',
                          w.enabled
                            ? 'text-neutral-900 dark:text-neutral-100'
                            : 'text-neutral-400 dark:text-neutral-500 line-through',
                        )}
                      >
                        {w.term}
                      </span>
                      {w.unreadCount > 0 ? (
                        <span className="rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {w.unreadCount}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(w)}
                      disabled={busy === w.id}
                      title={w.enabled ? 'Pause' : 'Resume'}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200 opacity-0 group-hover:opacity-100"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(w)}
                      disabled={busy === w.id}
                      title="Delete"
                      className="rounded p-1 text-neutral-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/50 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Matches
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={(e) => changeFilter(selectedWatchId, e.target.checked)}
                    className="h-3 w-3"
                  />
                  Unread only
                </label>
                <Button size="sm" variant="outline" onClick={onMarkAllRead}>
                  Mark all read
                </Button>
              </div>
            </div>
            {matches.length === 0 ? (
              <Card>
                <div className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No matches yet. Watches are polled every 10 minutes.
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {matches.map((m) => (
                  <MatchCard key={m.id} match={m} onMarkRead={onMarkRead} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <Card>
          <div className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No watches yet. Add a keyword above to start tracking mentions on Bluesky.
          </div>
        </Card>
      )}
    </div>
  )
}

function MatchCard({
  match,
  onMarkRead,
}: {
  match: KeywordMatchRow
  onMarkRead: (m: KeywordMatchRow) => void
}) {
  return (
    <Card className={cn(!match.read && 'border-indigo-300 dark:border-indigo-700')}>
      <div className="p-3">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {match.authorAvatar ? (
              <img src={match.authorAvatar} alt="" className="h-6 w-6 rounded-full" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-neutral-200 dark:bg-neutral-700" />
            )}
            <div>
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {match.authorName ?? match.authorHandle}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                @{match.authorHandle}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400">
              {match.watchTerm}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {match.publishedAt ? new Date(match.publishedAt).toLocaleString() : ''}
            </span>
          </div>
        </div>
        <p className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
          {match.content}
        </p>
        <div className="mt-2 flex items-center justify-end gap-2">
          {!match.read ? (
            <Button size="sm" variant="outline" onClick={() => onMarkRead(match)}>
              Mark read
            </Button>
          ) : null}
          {match.postUrl ? (
            <a
              href={match.postUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
            >
              View on Bluesky →
            </a>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
