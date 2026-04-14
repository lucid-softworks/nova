import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bell, Check, CheckCheck } from 'lucide-react'
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  type NotificationRow,
} from '~/server/notifications'
import { cn } from '~/lib/utils'

const POLL_MS = 30_000

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

  const reload = async () => {
    try {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'same-origin' })
      if (res.ok) {
        const j = (await res.json()) as { count: number }
        setCount(j.count)
      }
    } catch {
      // ignore
    }
  }

  const openAndLoad = async () => {
    setOpen(true)
    setLoading(true)
    try {
      const rows = await listMyNotifications()
      setItems(rows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    const id = setInterval(reload, POLL_MS)
    return () => clearInterval(id)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const markAll = async () => {
    await markAllNotificationsRead()
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    setCount(0)
  }

  const onItemClick = async (n: NotificationRow) => {
    if (!n.readAt) {
      await markNotificationsRead({ data: { ids: [n.id] } })
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      )
      setCount((c) => Math.max(0, c - 1))
    }
    const href = deriveLink(n)
    if (href) {
      setOpen(false)
      navigate({ to: href })
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void openAndLoad())}
        className="relative rounded-md p-2 hover:bg-neutral-100"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-neutral-700" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-[360px] overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
            <div className="text-sm font-semibold text-neutral-900">Notifications</div>
            <button
              type="button"
              onClick={markAll}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
            >
              <CheckCheck className="h-3 w-3" /> Mark all read
            </button>
          </div>
          <div className="max-h-[500px] overflow-auto">
            {loading ? (
              <div className="px-3 py-6 text-center text-xs text-neutral-500">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-3 py-10 text-center text-xs text-neutral-500">
                You&apos;re all caught up.
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onItemClick(n)}
                  className={cn(
                    'flex w-full gap-2 border-b border-neutral-100 px-3 py-2 text-left last:border-0 hover:bg-neutral-50',
                    !n.readAt && 'border-l-4 border-l-indigo-500',
                  )}
                >
                  <TypeIcon type={n.type} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-neutral-900">{n.title}</div>
                    <div className="line-clamp-2 text-xs text-neutral-600">{n.body}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider text-neutral-400">
                      {relTime(n.createdAt)}
                    </div>
                  </div>
                  {!n.readAt ? (
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TypeIcon({ type: _type }: { type: NotificationRow['type'] }) {
  void _type
  return (
    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
      <Check className="h-3 w-3" />
    </div>
  )
}

function deriveLink(n: NotificationRow): string | null {
  const postId = typeof n.data.postId === 'string' ? n.data.postId : null
  if (!n.workspaceSlug) return null
  if (n.type === 'campaign_on_hold' && typeof n.data.campaignId === 'string') {
    return `/${n.workspaceSlug}/posts/campaigns/${n.data.campaignId}`
  }
  if (postId) return `/${n.workspaceSlug}/posts`
  return `/${n.workspaceSlug}/posts`
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
