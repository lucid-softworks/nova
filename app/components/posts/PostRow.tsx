import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Check, Copy, ExternalLink, MoreHorizontal, RotateCw, Target, Trash2, CalendarClock } from 'lucide-react'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { PostStatusBadge, PostTypeBadge } from './badges'
import { cn } from '~/lib/utils'
import { schedulePost } from '~/server/scheduling'
import { duplicatePost, retryPost, deletePosts, type PostRow as Row } from '~/server/posts'

export function PostRow({
  post,
  workspaceSlug,
  selected,
  onToggleSelect,
  onChanged,
  indent = false,
}: {
  post: Row
  workspaceSlug: string
  selected: boolean
  onToggleSelect: (id: string) => void
  onChanged: () => Promise<void>
  indent?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [busy, setBusy] = useState(false)

  const [scheduleAt, setScheduleAt] = useState<string>(() => {
    const d = post.scheduledAt ? new Date(post.scheduledAt) : new Date(Date.now() + 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  const confirmReschedule = async () => {
    setBusy(true)
    try {
      await schedulePost({
        data: {
          workspaceSlug,
          postId: post.id,
          scheduledAt: new Date(scheduleAt).toISOString(),
        },
      })
      setRescheduling(false)
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  const onDuplicate = async () => {
    setBusy(true)
    try {
      await duplicatePost({ data: { workspaceSlug, postId: post.id } })
      await onChanged()
    } finally {
      setBusy(false)
      setMenuOpen(false)
    }
  }
  const onRetry = async () => {
    setBusy(true)
    try {
      await retryPost({ data: { workspaceSlug, postId: post.id } })
      await onChanged()
    } finally {
      setBusy(false)
      setMenuOpen(false)
    }
  }
  const onDelete = async () => {
    if (!confirm('Delete this post?')) return
    setBusy(true)
    try {
      await deletePosts({ data: { workspaceSlug, postIds: [post.id] } })
      await onChanged()
    } finally {
      setBusy(false)
      setMenuOpen(false)
    }
  }

  const liveUrl = post.platforms.find((p) => p.publishedUrl)?.publishedUrl ?? null

  return (
    <div
      className={cn(
        'flex items-start gap-3 border-b border-neutral-100 px-3 py-3',
        indent && 'pl-12 bg-neutral-50/50',
        selected && 'bg-indigo-50/40',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(post.id)}
        className="mt-1"
      />
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-neutral-100">
        {post.firstMediaUrl ? (
          post.firstMediaMime?.startsWith('video/') ? (
            <video src={post.firstMediaUrl} className="h-full w-full object-cover" muted />
          ) : (
            <img src={post.firstMediaUrl} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-300">
            <Target className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <PostTypeBadge type={post.type} />
          {post.campaignName && !indent ? (
            <Link
              to="/$workspaceSlug/posts/campaigns/$campaignId"
              params={{ workspaceSlug, campaignId: post.campaignId! }}
              className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 hover:bg-indigo-100"
            >
              <Target className="h-2.5 w-2.5" /> {post.campaignName}
              {post.campaignStepOrder != null ? <span className="ml-1">· Step {post.campaignStepOrder + 1}</span> : null}
            </Link>
          ) : null}
          {post.versionCount > 1 ? (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
              +{post.versionCount - 1} versions
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 line-clamp-2 text-sm text-neutral-900">
          {post.reshareSource ? (
            <span className="text-neutral-600">
              from <span className="font-medium">@{post.reshareSource.authorHandle}</span>:{' '}
              <span className="text-neutral-500">{post.reshareSource.preview}</span>
            </span>
          ) : (
            post.defaultContent || <span className="italic text-neutral-400">No content</span>
          )}
        </div>
        {post.failureReason ? (
          <div className="mt-0.5 text-xs text-red-600">{post.failureReason}</div>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1 text-xs text-neutral-500">
        <div className="flex gap-0.5">
          {post.platforms.slice(0, 6).map((p) => (
            <PlatformIcon key={p.socialAccountId} platform={p.platform} size={18} />
          ))}
          {post.platforms.length > 6 ? <span>+{post.platforms.length - 6}</span> : null}
        </div>
        <PostStatusBadge status={post.status} />
        <div>
          {post.publishedAt
            ? fmtDate(post.publishedAt)
            : post.scheduledAt
              ? fmtDate(post.scheduledAt)
              : fmtDate(post.createdAt)}
        </div>
        <div>{post.authorName ?? ''}</div>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100"
          aria-label="Row actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-10 mt-1 w-52 rounded-md border border-neutral-200 bg-white p-1 text-sm shadow-lg">
            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100"
              >
                <ExternalLink className="h-3 w-3" /> View on platform
              </a>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100"
              onClick={() => {
                setMenuOpen(false)
                setRescheduling(true)
              }}
              disabled={post.status === 'published'}
            >
              <CalendarClock className="h-3 w-3" /> Reschedule
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100"
              onClick={onDuplicate}
              disabled={busy}
            >
              <Copy className="h-3 w-3" /> Duplicate
            </button>
            {post.status === 'failed' ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100"
                onClick={onRetry}
                disabled={busy}
              >
                <RotateCw className="h-3 w-3" /> Retry
              </button>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-red-600 hover:bg-red-50"
              onClick={onDelete}
              disabled={busy}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        ) : null}
        {rescheduling ? (
          <div className="absolute right-0 top-full z-10 mt-1 w-80 rounded-md border border-neutral-200 bg-white p-3 shadow-lg">
            <div className="mb-2 text-sm font-semibold">Reschedule</div>
            <Input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="mb-3"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRescheduling(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={confirmReschedule} disabled={busy}>
                {busy ? <Spinner /> : <Check className="h-3 w-3" />} Confirm
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = Math.abs(now - d.getTime())
  if (diff < 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
