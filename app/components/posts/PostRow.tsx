import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, History, MoreHorizontal, Pencil, RotateCw, Target, Trash2, CalendarClock, ThumbsUp, ThumbsDown } from 'lucide-react'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { Button } from '~/components/ui/button'
import { useConfirm } from '~/components/ui/confirm'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown'
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
  addPostNote,
  listWorkspaceMembers,
  type PostActivityRow,
  type PostRow as Row,
  type WorkspaceMemberRef,
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
  const confirm = useConfirm()
  const navigate = useNavigate()
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
    }
  }
  const onRetry = async () => {
    setBusy(true)
    try {
      await retryPost({ data: { workspaceSlug, postId: post.id } })
      await onChanged()
    } finally {
      setBusy(false)
    }
  }
  const onDelete = async () => {
    const ok = await confirm({
      message: 'Delete this post?',
      destructive: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setBusy(true)
    try {
      await deletePosts({ data: { workspaceSlug, postIds: [post.id] } })
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  const liveUrl = post.platforms.find((p) => p.publishedUrl)?.publishedUrl ?? null

  return (
    <div className={cn('border-b border-neutral-100 dark:border-neutral-800', selected && 'bg-indigo-50/40')}>
    <div
      className={cn(
        'flex flex-wrap items-start gap-3 px-3 py-3',
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
      <div
        role="button"
        tabIndex={0}
        onClick={() =>
          navigate({
            to: '/$workspaceSlug/compose',
            params: { workspaceSlug },
            search: { postId: post.id },
          })
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            navigate({
              to: '/$workspaceSlug/compose',
              params: { workspaceSlug },
              search: { postId: post.id },
            })
          }
        }}
        className="min-w-0 w-full cursor-pointer sm:w-0 sm:flex-1"
      >
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
              onClick={(e) => e.stopPropagation()}
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400 sm:flex-col sm:items-end sm:gap-1">
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
        {post.authorName ? <div>{post.authorName}</div> : null}
      </div>
      {isPending && canApprove ? (
        <div className="flex flex-wrap gap-1 sm:flex-col">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded p-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Row actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {liveUrl ? (
              <DropdownMenuItem asChild>
                <a href={liveUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3 w-3" /> View on platform
                </a>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={() => setRescheduling(true)}
              disabled={post.status === 'published'}
            >
              <CalendarClock className="h-3 w-3" /> Reschedule
            </DropdownMenuItem>
            {post.status !== 'published' ? (
              <DropdownMenuItem asChild>
                <Link
                  to="/$workspaceSlug/compose"
                  params={{ workspaceSlug }}
                  search={{ postId: post.id }}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={onDuplicate} disabled={busy}>
              <Copy className="h-3 w-3" /> Duplicate
            </DropdownMenuItem>
            {isDraft ? (
              <DropdownMenuItem onSelect={() => setRecurringOpen(true)}>
                <RotateCw className="h-3 w-3" /> {t('recurring.repeat')}
              </DropdownMenuItem>
            ) : null}
            {post.status === 'failed' ? (
              <DropdownMenuItem onSelect={onRetry} disabled={busy}>
                <RotateCw className="h-3 w-3" /> Retry
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={onDelete} disabled={busy} className="text-red-600 focus:bg-red-50 dark:focus:bg-red-950/40">
              <Trash2 className="h-3 w-3" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {rescheduling ? (
          <div className="absolute right-0 top-full z-10 mt-1 w-80 max-w-[calc(100vw-1rem)] rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-lg">
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
              placeholder={t('postRow.requestChangesNote')}
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
  const [members, setMembers] = useState<WorkspaceMemberRef[]>([])

  useEffect(() => {
    if (!open || rows !== null) return
    setLoading(true)
    Promise.all([
      listPostActivity({ data: { workspaceSlug, postId } }),
      listWorkspaceMembers({ data: { workspaceSlug } }),
    ])
      .then(([activity, mem]) => {
        setRows(activity)
        setMembers(mem)
      })
      .finally(() => setLoading(false))
  }, [open, rows, workspaceSlug, postId])

  const reload = async () => {
    const next = await listPostActivity({ data: { workspaceSlug, postId } })
    setRows(next)
  }

  return (
    <div className={cn('border-t border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 px-3 py-2 text-xs', indent && 'pl-12')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800"
      >
        <History className="h-3 w-3" />
        {open ? 'Hide' : 'Show'} activity & notes
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {loading ? (
            <div className="text-neutral-500 dark:text-neutral-400">Loading…</div>
          ) : rows && rows.length > 0 ? (
            <div className="space-y-1">
              {rows.map((r) => (
                <div key={r.id} className="flex items-start gap-2">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-200 capitalize">{r.action.replace('_', ' ')}</span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {r.userName ? `by ${r.userName} ` : ''}
                    · {new Date(r.createdAt).toLocaleString()}
                  </span>
                  {r.note ? <span className="text-neutral-700 dark:text-neutral-200">— {r.note}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-neutral-500 dark:text-neutral-400">No activity yet.</div>
          )}
          <NoteInput
            workspaceSlug={workspaceSlug}
            postId={postId}
            members={members}
            onAdded={reload}
          />
        </div>
      ) : null}
    </div>
  )
}

function NoteInput({
  workspaceSlug,
  postId,
  members,
  onAdded,
}: {
  workspaceSlug: string
  postId: string
  members: WorkspaceMemberRef[]
  onAdded: () => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFilter, setPickerFilter] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Parse @[Name](userId) tokens out of the note; the display text strips
  // the parenthesized id. We insert these when the user picks from the
  // mention popover so we don't have to guess ambiguous names later.
  const { display, mentionedUserIds } = parseMentionTokens(note)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setNote(value)
    const caret = e.target.selectionStart ?? value.length
    // Find the last @ before the caret with no whitespace after it until caret.
    const slice = value.slice(0, caret)
    const at = slice.lastIndexOf('@')
    if (at >= 0 && !/\s/.test(slice.slice(at + 1))) {
      setPickerFilter(slice.slice(at + 1).toLowerCase())
      setPickerOpen(true)
    } else {
      setPickerOpen(false)
    }
  }

  const pickMember = (m: WorkspaceMemberRef) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const caret = textarea.selectionStart ?? note.length
    const before = note.slice(0, caret)
    const after = note.slice(caret)
    const at = before.lastIndexOf('@')
    if (at < 0) return
    const token = `@[${m.name}](${m.userId}) `
    const next = before.slice(0, at) + token + after
    setNote(next)
    setPickerOpen(false)
    // Restore cursor after the inserted token.
    requestAnimationFrame(() => {
      textarea.focus()
      const pos = at + token.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  const submit = async () => {
    if (!display.trim()) return
    setSubmitting(true)
    try {
      await addPostNote({
        data: { workspaceSlug, postId, note: display, mentionedUserIds },
      })
      setNote('')
      await onAdded()
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = members.filter((m) => {
    if (!pickerFilter) return true
    const q = pickerFilter.toLowerCase()
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  })

  return (
    <div className="relative mt-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2">
      <textarea
        ref={textareaRef}
        value={note}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
        placeholder="Add a note. Type @ to mention a teammate…"
        rows={2}
        maxLength={5000}
        className="w-full resize-none bg-transparent text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none"
      />
      {pickerOpen && filtered.length > 0 ? (
        <div className="absolute left-2 right-2 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg">
          {filtered.slice(0, 8).map((m) => (
            <button
              key={m.userId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                pickMember(m)
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
              ) : (
                <div className="h-5 w-5 rounded-full bg-neutral-200 dark:bg-neutral-700" />
              )}
              <span className="text-neutral-900 dark:text-neutral-100">{m.name}</span>
              <span className="text-neutral-500 dark:text-neutral-400">{m.email}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          {mentionedUserIds.length > 0
            ? `Will notify ${mentionedUserIds.length} ${mentionedUserIds.length === 1 ? 'person' : 'people'}`
            : 'Type @ to mention workspace members'}
        </span>
        <Button size="sm" variant="outline" onClick={submit} disabled={submitting || !display.trim()}>
          {submitting ? <Spinner /> : null} Add note
        </Button>
      </div>
    </div>
  )
}

function parseMentionTokens(raw: string): { display: string; mentionedUserIds: string[] } {
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g
  const ids = new Set<string>()
  const display = raw.replace(re, (_m, name, id) => {
    ids.add(id)
    return `@${name}`
  })
  return { display, mentionedUserIds: [...ids] }
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
