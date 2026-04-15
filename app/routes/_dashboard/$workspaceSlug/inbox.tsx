import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, Check } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { cn } from '~/lib/utils'
import { listInbox, markInboxRead, pollInboxNow, type InboxRow } from '~/server/inbox'

type Kind = 'all' | 'mention' | 'reply' | 'like' | 'repost' | 'follow'

const KINDS: { key: Kind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mention', label: 'Mentions' },
  { key: 'reply', label: 'Replies' },
  { key: 'like', label: 'Likes' },
  { key: 'repost', label: 'Reposts' },
  { key: 'follow', label: 'Follows' },
]

export const Route = createFileRoute('/_dashboard/$workspaceSlug/inbox')({
  loader: async ({ params }) => ({
    items: await listInbox({ data: { workspaceSlug: params.workspaceSlug, kind: 'all' } }),
  }),
  component: InboxPage,
})

function InboxPage() {
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData() as { items: InboxRow[] }
  const [items, setItems] = useState<InboxRow[]>(initial.items)
  const [kind, setKind] = useState<Kind>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const next = await listInbox({
        data: { workspaceSlug, kind, unread: unreadOnly ? true : undefined },
      })
      setItems(next)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, unreadOnly])

  const toggleRead = async (id: string, read: boolean) => {
    await markInboxRead({ data: { workspaceSlug, ids: [id], read } })
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, readAt: read ? new Date().toISOString() : null } : i,
      ),
    )
  }

  const syncNow = async () => {
    await pollInboxNow({ data: { workspaceSlug } })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Inbox
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Mentions, replies, and reactions from your connected Bluesky + Mastodon accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
          <Button size="sm" variant="ghost" onClick={syncNow} title="Fetch new inbox items now">
            <RefreshCw className="h-3 w-3" /> Sync
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {KINDS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setKind(t.key)}
            className={cn(
              'px-3 py-2 text-sm font-medium',
              kind === t.key
                ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <p className="p-4 text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
            Nothing here yet. We poll every five minutes; Sync triggers it sooner.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {items.map((i) => (
              <li
                key={i.id}
                className={cn(
                  'flex items-start gap-3 p-3 text-sm',
                  !i.readAt && 'bg-indigo-50/40 dark:bg-indigo-950/30',
                )}
              >
                <div className="mt-0.5">
                  <PlatformIcon platform={i.platform as never} size={20} />
                </div>
                {i.actorAvatar ? (
                  <img
                    src={i.actorAvatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-neutral-100 dark:bg-neutral-800" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-neutral-900 dark:text-neutral-100">
                    <span className="font-medium">
                      {i.actorName ?? i.actorHandle ?? 'Someone'}
                    </span>{' '}
                    <span className="text-neutral-500 dark:text-neutral-400">{i.kind}</span>
                    {i.actorHandle ? (
                      <span className="ml-1 text-xs text-neutral-500 dark:text-neutral-400">
                        @{i.actorHandle}
                      </span>
                    ) : null}
                  </div>
                  {i.content ? (
                    <div className="mt-0.5 line-clamp-3 text-sm text-neutral-700 dark:text-neutral-300">
                      {i.content}
                    </div>
                  ) : null}
                  <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400 dark:text-neutral-500">
                    <time>{new Date(i.itemCreatedAt).toLocaleString()}</time>
                    {i.permalink ? (
                      <a
                        href={i.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggleRead(i.id, !i.readAt)}
                      className="inline-flex items-center gap-0.5 hover:underline"
                    >
                      <Check className="h-3 w-3" /> {i.readAt ? 'Mark unread' : 'Mark read'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
