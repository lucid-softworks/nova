import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { CheckCheck } from 'lucide-react'
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  type NotificationRow,
} from '~/server/notifications'
import { deriveNotificationLink } from '~/components/layout/NotificationBell'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/notifications')({
  loader: async () => {
    const rows = await listMyNotifications()
    return { rows }
  },
  component: NotificationsPage,
})

function NotificationsPage() {
  const initial = Route.useLoaderData()
  const [rows, setRows] = useState<NotificationRow[]>(initial.rows)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const navigate = useNavigate()

  const onClickItem = async (n: NotificationRow) => {
    if (!n.readAt) {
      await markNotificationsRead({ data: { ids: [n.id] } })
      setRows((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      )
    }
    const href = deriveNotificationLink(n)
    if (href) navigate({ to: href })
  }

  const onMarkAll = async () => {
    await markAllNotificationsRead()
    const now = new Date().toISOString()
    setRows((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })))
  }

  const visible = filter === 'unread' ? rows.filter((n) => !n.readAt) : rows
  const unreadCount = rows.filter((n) => !n.readAt).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Notifications</h2>
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            {unreadCount} unread · {rows.length} total
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-xs">
            {(['all', 'unread'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  'rounded px-2 py-1 capitalize',
                  filter === k ? 'bg-neutral-900 text-white' : 'text-neutral-600 dark:text-neutral-300',
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={onMarkAll} disabled={unreadCount === 0}>
            <CheckCheck className="h-3 w-3" /> Mark all read
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        {visible.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {filter === 'unread' ? "You're all caught up." : 'No notifications yet.'}
          </div>
        ) : (
          visible.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void onClickItem(n)}
              className={cn(
                'flex w-full items-start gap-3 border-b border-neutral-100 dark:border-neutral-800 px-4 py-3 text-left last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-800',
                !n.readAt && 'border-l-4 border-l-indigo-500',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{n.title}</span>
                  <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 text-[10px] uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                    {n.type.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">{n.body}</div>
                <div className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                  {new Date(n.createdAt).toLocaleString()}
                </div>
              </div>
              {!n.readAt ? (
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
