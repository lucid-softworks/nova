import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, History, MoreHorizontal, Pencil, RotateCw, Target, Trash2, CalendarClock, ThumbsUp, ThumbsDown } from 'lucide-react'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { PostStatusBadge, PostTypeBadge } from './badges'
import { RecurringDialog } from './RecurringDialog'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'
import { approvePost, requestChanges, schedulePost } from '~/server/scheduling'
import {
  duplicatePost,
  retryPost,
  deletePosts,
  listPostActivity,
  type PostActivityRow,
  type PostRow as Row,
} from '~/server/posts'
import type { WorkspaceRole } from '~/server/types'
import type { AccountSummary } from '~/server/accounts'

export function PostRow({
  post,
  workspaceSlug,
  selected,
  onToggleSelect,
  onChanged,
  indent = false,
  userRole,
  accounts = [],
  hasRecurringRule = false,
}: {
  post: Row
  workspaceSlug: string
  selected: boolean
  onToggleSelect: (id: string) => void
  onChanged: () => Promise<void>
  indent?: boolean
  userRole?: WorkspaceRole
  accounts?: AccountSummary[]
  hasRecurringRule?: boolean
}) {
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [requestChangesOpen, setRequestChangesOpen] = useState(false)
  const [note, setNote] = useState('')
  const canApprove = userRole === 'admin' || userRole === 'manager'
  const isPending = post.status === 'pending_approval'
  const isDraft = post.status === 'draft'

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
    <div className={cn('border-b border-neutral-100 dark:border-neutral-800', selected && 'bg-indigo-50/40')}>
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-3',
        indent && 'pl-12 bg-neutral-50/50',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(post.id)}
        className="mt-1"
      />
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
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
          {hasRecurringRule ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <RotateCw className="h-2.5 w-2.5" /> {t('recurring.repeat')}
            </span>
          ) : null}
          {post.campaignName && !indent ? (
            <Link
              to="/$workspaceSlug/posts/campaigns/$campaignId"
              params={{ workspaceSlug, campaignId: post.campaignId! }}
              className="inline-flex items-center gap-1 rounded bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100"
            >
              <Target className="h-2.5 w-2.5" /> {post.campaignName}
              {post.campaignStepOrder != null ? <span className="ml-1">· Step {post.campaignStepOrder + 1}</span> : null}
            </Link>
          ) : null}
          {post.versionCount > 1 ? (
            <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 dark:text-neutral-300">
              +{post.versionCount - 1} versions
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 line-clamp-2 text-sm text-neutral-900 dark:text-neutral-100">
          {post.reshareSource ? (
            <span className="text-neutral-600 dark:text-neutral-300">
              from <span className="font-medium">@{post.reshareSource.authorHandle}</span>:{' '}
              <span className="text-neutral-500 dark:text-neutral-400">{post.reshareSource.preview}</span>
            </span>
          ) : (
            post.defaultContent || <span className="italic text-neutral-400 dark:text-neutral-500">No content</span>
          )}
        </div>
        {post.failureReason ? (
          <div className="mt-0.5 text-xs text-red-600">{post.failureReason}</div>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1 text-xs text-neutral-500 dark:text-neutral-400">
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
      {isPending && canApprove ? (
        <div className="flex flex-col gap-1">
          <Button
            size="sm"
            variant="outline"
            className="text-green-700 dark:text-green-300"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await approvePost({
                  data: { workspaceSlug, postId: post.id, scheduledAt: null },
                })
                await onChanged()
              } finally {
                setBusy(false)
              }
            }}
          >
            <ThumbsUp className="h-3 w-3" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600"
            onClick={() => setRequestChangesOpen(true)}
            disabled={busy}
          >
            <ThumbsDown className="h-3 w-3" /> Request Changes
          </Button>
        </div>
      ) : null}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded p-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Row actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-10 mt-1 w-52 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1 text-sm shadow-lg">
            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <ExternalLink className="h-3 w-3" /> View on platform
              </a>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => {
                setMenuOpen(false)
                setRescheduling(true)
              }}
              disabled={post.status === 'published'}
            >
              <CalendarClock className="h-3 w-3" /> Reschedule
            </button>
            {post.status !== 'published' ? (
              <Link
                to="/$workspaceSlug/compose"
                params={{ workspaceSlug }}
                search={{ postId: post.id }}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => setMenuOpen(false)}
              >
                <Pencil className="h-3 w-3" /> Edit
              </Link>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={onDuplicate}
              disabled={busy}
            >
              <Copy className="h-3 w-3" /> Duplicate
            </button>
            {isDraft ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => {
                  setMenuOpen(false)
                  setRecurringOpen(true)
                }}
              >
                <RotateCw className="h-3 w-3" /> {t('recurring.repeat')}
              </button>
            ) : null}
            {post.status === 'failed' ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
          <div className="absolute right-0 top-full z-10 mt-1 w-80 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-lg">
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
      {requestChangesOpen ? (
        <div className="fixed inset-0 z-50" onClick={(e) => e.stopPropagation()}>
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setRequestChangesOpen(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(420px,95%)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xl">
            <div className="mb-2 text-sm font-semibold">Request changes</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What should change?"
              className="min-h-[100px] w-full resize-y rounded border border-neutral-200 dark:border-neutral-800 p-2 text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRequestChangesOpen(false)
                  setNote('')
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  setBusy(true)
                  try {
                    await requestChanges({
                      data: { workspaceSlug, postId: post.id, note },
                    })
                    setRequestChangesOpen(false)
                    setNote('')
                    await onChanged()
                  } finally {
                    setBusy(false)
                  }
                }}
                disabled={busy}
              >
                {busy ? <Spinner /> : null} Send
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {recurringOpen ? (
        <RecurringDialog
          open={recurringOpen}
          onOpenChange={setRecurringOpen}
          workspaceSlug={workspaceSlug}
          postId={post.id}
          accounts={accounts}
        />
      ) : null}
    </div>
    {isPending ? (
      <PostActivityTimeline workspaceSlug={workspaceSlug} postId={post.id} indent={indent} />
    ) : null}
    </div>
  )
}

function PostActivityTimeline({
  workspaceSlug,
  postId,
  indent,
}: {
  workspaceSlug: string
  postId: string
  indent: boolean
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PostActivityRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || rows !== null) return
    setLoading(true)
    listPostActivity({ data: { workspaceSlug, postId } })
      .then(setRows)
      .finally(() => setLoading(false))
  }, [open, rows, workspaceSlug, postId])

  return (
    <div className={cn('border-t border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 px-3 py-2 text-xs', indent && 'pl-12')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800"
      >
        <History className="h-3 w-3" />
        {open ? 'Hide' : 'Show'} approval timeline
      </button>
      {open ? (
        <div className="mt-2 space-y-1">
          {loading ? (
            <div className="text-neutral-500 dark:text-neutral-400">Loading…</div>
          ) : rows && rows.length > 0 ? (
            rows.map((r) => (
              <div key={r.id} className="flex items-start gap-2">
                <span className="font-semibold text-neutral-700 dark:text-neutral-200 capitalize">{r.action.replace('_', ' ')}</span>
                <span className="text-neutral-500 dark:text-neutral-400">
                  {r.userName ? `by ${r.userName} ` : ''}
                  · {new Date(r.createdAt).toLocaleString()}
                </span>
                {r.note ? <span className="text-neutral-700 dark:text-neutral-200">— {r.note}</span> : null}
              </div>
            ))
          ) : (
            <div className="text-neutral-500 dark:text-neutral-400">No activity yet.</div>
          )}
        </div>
      ) : null}
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
