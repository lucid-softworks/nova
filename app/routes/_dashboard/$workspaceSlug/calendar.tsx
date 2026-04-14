import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, ExternalLink, Trash2, CalendarClock } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { listPostsForCalendar, deletePosts, type PostRow } from '~/server/posts'
import { schedulePost } from '~/server/scheduling'
import { PostPill } from '~/components/calendar/PostPill'
import {
  endOfWeek,
  fmtTime,
  monthGrid,
  sameDay,
  startOfMonth,
  startOfWeek,
  ymd,
} from '~/components/calendar/helpers'
import { PostStatusBadge } from '~/components/posts/badges'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { cn } from '~/lib/utils'

type View = 'month' | 'week'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/calendar')({
  loader: async ({ params }) => {
    const now = new Date()
    // Expand to monthGrid bounds so days bleeding into adjacent months render too
    const gridStart = startOfWeek(startOfMonth(now))
    const gridEnd = new Date(gridStart)
    gridEnd.setDate(gridEnd.getDate() + 41)
    gridEnd.setHours(23, 59, 59, 999)
    const rows = await listPostsForCalendar({
      data: {
        workspaceSlug: params.workspaceSlug,
        fromIso: gridStart.toISOString(),
        toIso: gridEnd.toISOString(),
      },
    })
    return { rows }
  },
  component: CalendarPage,
})

function CalendarPage() {
  const { workspaceSlug } = Route.useParams()
  const navigate = useNavigate()
  const initial = Route.useLoaderData()
  const [anchor, setAnchor] = useState(() => new Date())
  const [view, setView] = useState<View>('month')
  const [posts, setPosts] = useState<PostRow[]>(initial.rows)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PostRow | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const range = useMemo(() => {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(anchor))
      const end = new Date(start)
      end.setDate(end.getDate() + 41)
      end.setHours(23, 59, 59, 999)
      return { start, end }
    }
    return { start: startOfWeek(anchor), end: endOfWeek(anchor) }
  }, [anchor, view])

  const reload = async () => {
    setLoading(true)
    try {
      const rows = await listPostsForCalendar({
        data: {
          workspaceSlug,
          fromIso: range.start.toISOString(),
          toIso: range.end.toISOString(),
        },
      })
      setPosts(rows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), range.end.getTime(), view])

  const postsByDay = useMemo(() => {
    const map = new Map<string, PostRow[]>()
    for (const p of posts) {
      const iso = p.publishedAt ?? p.scheduledAt
      if (!iso) continue
      const k = ymd(new Date(iso))
      const arr = map.get(k)
      if (arr) arr.push(p)
      else map.set(k, [p])
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const at = a.publishedAt ?? a.scheduledAt ?? ''
        const bt = b.publishedAt ?? b.scheduledAt ?? ''
        return at.localeCompare(bt)
      })
    }
    return map
  }, [posts])

  const onDragEnd = async (e: DragEndEvent) => {
    const postId = e.active.id as string
    const dayKey = e.over?.id as string | undefined
    if (!postId || !dayKey) return
    const post = posts.find((p) => p.id === postId)
    if (!post) return
    const sourceIso = post.scheduledAt ?? post.publishedAt
    if (!sourceIso) return
    const source = new Date(sourceIso)
    const target = new Date(dayKey)
    target.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), 0)

    if (ymd(source) === ymd(target)) return // same day — noop
    if (post.status === 'published') {
      alert("Can't reschedule a post that's already published.")
      return
    }
    // Optimistic update
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, scheduledAt: target.toISOString() } : p)),
    )
    try {
      await schedulePost({
        data: {
          workspaceSlug,
          postId,
          scheduledAt: target.toISOString(),
        },
      })
      await reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reschedule failed')
      await reload()
    }
  }

  const goToday = () => setAnchor(new Date())
  const goPrev = () => {
    const n = new Date(anchor)
    if (view === 'month') n.setMonth(n.getMonth() - 1)
    else n.setDate(n.getDate() - 7)
    setAnchor(n)
  }
  const goNext = () => {
    const n = new Date(anchor)
    if (view === 'month') n.setMonth(n.getMonth() + 1)
    else n.setDate(n.getDate() + 7)
    setAnchor(n)
  }

  const title =
    view === 'month'
      ? anchor.toLocaleString(undefined, { month: 'long', year: 'numeric' })
      : `${startOfWeek(anchor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endOfWeek(anchor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  const openComposerForDate = (d: Date) => {
    navigate({
      to: '/$workspaceSlug/compose',
      params: { workspaceSlug },
      search: { scheduledAt: d.toISOString() },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-neutral-200 bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView('month')}
              className={cn('rounded px-2 py-1', view === 'month' ? 'bg-neutral-900 text-white' : 'text-neutral-600')}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setView('week')}
              className={cn('rounded px-2 py-1', view === 'week' ? 'bg-neutral-900 text-white' : 'text-neutral-600')}
            >
              Week
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={goPrev} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={goToday}>
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={goNext} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold text-neutral-900">{title}</div>
          {loading ? <Spinner /> : null}
        </div>
        <Button asChild size="sm">
          <Link to="/$workspaceSlug/compose" params={{ workspaceSlug }}>
            New Post
          </Link>
        </Button>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {view === 'month' ? (
          <MonthGrid
            anchor={anchor}
            postsByDay={postsByDay}
            onClickEmpty={openComposerForDate}
            onClickPost={(p) => setPreview(p)}
          />
        ) : (
          <WeekGrid
            anchor={anchor}
            postsByDay={postsByDay}
            onClickEmpty={openComposerForDate}
            onClickPost={(p) => setPreview(p)}
          />
        )}
      </DndContext>

      <QuickViewPopover
        post={preview}
        workspaceSlug={workspaceSlug}
        onClose={() => setPreview(null)}
        onChanged={async () => {
          setPreview(null)
          await reload()
        }}
      />
    </div>
  )
}

// --------------------------------------------------------------------------

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function MonthGrid({
  anchor,
  postsByDay,
  onClickEmpty,
  onClickPost,
}: {
  anchor: Date
  postsByDay: Map<string, PostRow[]>
  onClickEmpty: (d: Date) => void
  onClickPost: (p: PostRow) => void
}) {
  const days = monthGrid(anchor)
  const month = anchor.getMonth()
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {DAY_LABELS.map((l) => (
          <div key={l} className="px-2 py-1.5">
            {l}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d) => (
          <DayCell
            key={d.toISOString()}
            day={d}
            inMonth={d.getMonth() === month}
            posts={postsByDay.get(ymd(d)) ?? []}
            onClickEmpty={onClickEmpty}
            onClickPost={onClickPost}
          />
        ))}
      </div>
    </div>
  )
}

function DayCell({
  day,
  inMonth,
  posts,
  onClickEmpty,
  onClickPost,
}: {
  day: Date
  inMonth: boolean
  posts: PostRow[]
  onClickEmpty: (d: Date) => void
  onClickPost: (p: PostRow) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ymd(day) })
  const [showMore, setShowMore] = useState(false)
  const visible = posts.slice(0, 4)
  const hidden = posts.slice(4)
  const isToday = sameDay(day, new Date())

  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClickEmpty(day)
      }}
      className={cn(
        'relative flex h-[130px] flex-col gap-0.5 border-b border-r border-neutral-100 p-1.5 text-xs transition-colors',
        !inMonth && 'bg-neutral-50/60 text-neutral-400',
        isOver && 'bg-indigo-50 ring-2 ring-indigo-300',
      )}
    >
      <div
        className={cn(
          'flex justify-end text-[11px] font-medium',
          isToday && 'inline-flex self-end rounded-full bg-indigo-500 px-1.5 text-white',
        )}
      >
        {day.getDate()}
      </div>
      <div className="flex flex-col gap-0.5 overflow-hidden">
        {visible.map((p) => (
          <PostPill key={p.id} post={p} onClick={() => onClickPost(p)} compact />
        ))}
        {hidden.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowMore((s) => !s)
              }}
              className="w-full rounded bg-neutral-100 px-1.5 py-0.5 text-left text-[10px] font-semibold text-neutral-600 hover:bg-neutral-200"
            >
              +{hidden.length} more
            </button>
            {showMore ? (
              <div
                className="absolute left-0 top-full z-10 mt-1 w-64 space-y-0.5 rounded-md border border-neutral-200 bg-white p-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {hidden.map((p) => (
                  <PostPill
                    key={p.id}
                    post={p}
                    onClick={() => {
                      setShowMore(false)
                      onClickPost(p)
                    }}
                    draggable={false}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------

function WeekGrid({
  anchor,
  postsByDay,
  onClickEmpty,
  onClickPost,
}: {
  anchor: Date
  postsByDay: Map<string, PostRow[]>
  onClickEmpty: (d: Date) => void
  onClickPost: (p: PostRow) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek(anchor))
    d.setDate(d.getDate() + i)
    return d
  })
  const hours = Array.from({ length: 24 }, (_, h) => h)

  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-neutral-200 bg-neutral-50">
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="border-l border-neutral-100 px-2 py-1.5 text-xs font-semibold">
            <div className="text-neutral-500">
              {d.toLocaleDateString(undefined, { weekday: 'short' })}
            </div>
            <div className="text-neutral-900">{d.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="grid max-h-[65vh] grid-cols-[48px_repeat(7,minmax(0,1fr))] overflow-auto">
        {hours.map((h) => (
          <HourRow
            key={h}
            hour={h}
            days={days}
            postsByDay={postsByDay}
            onClickEmpty={onClickEmpty}
            onClickPost={onClickPost}
          />
        ))}
      </div>
    </div>
  )
}

function HourRow({
  hour,
  days,
  postsByDay,
  onClickEmpty,
  onClickPost,
}: {
  hour: number
  days: Date[]
  postsByDay: Map<string, PostRow[]>
  onClickEmpty: (d: Date) => void
  onClickPost: (p: PostRow) => void
}) {
  return (
    <>
      <div className="border-t border-neutral-100 px-1 py-1 text-[10px] text-neutral-400">
        {String(hour).padStart(2, '0')}:00
      </div>
      {days.map((d) => {
        const slotDate = new Date(d)
        slotDate.setHours(hour, 0, 0, 0)
        const entries = (postsByDay.get(ymd(d)) ?? []).filter((p) => {
          const iso = p.publishedAt ?? p.scheduledAt
          if (!iso) return false
          return new Date(iso).getHours() === hour
        })
        return (
          <div
            key={d.toISOString()}
            className="relative min-h-[40px] border-l border-t border-neutral-100 p-0.5"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClickEmpty(slotDate)
            }}
          >
            <div className="flex flex-col gap-0.5">
              {entries.map((p) => (
                <PostPill key={p.id} post={p} onClick={() => onClickPost(p)} compact draggable={false} />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// --------------------------------------------------------------------------

function QuickViewPopover({
  post,
  workspaceSlug,
  onClose,
  onChanged,
}: {
  post: PostRow | null
  workspaceSlug: string
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [rescheduleAt, setRescheduleAt] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!post) return
    const iso = post.scheduledAt ?? post.publishedAt ?? new Date().toISOString()
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    setRescheduleAt(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    )
  }, [post])

  if (!post) return null

  const liveUrl = post.platforms.find((p) => p.publishedUrl)?.publishedUrl ?? null

  const confirmReschedule = async () => {
    setBusy(true)
    try {
      await schedulePost({
        data: { workspaceSlug, postId: post.id, scheduledAt: new Date(rescheduleAt).toISOString() },
      })
      await onChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Reschedule failed')
    } finally {
      setBusy(false)
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
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(500px,95%)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <PostStatusBadge status={post.status} />
            <div className="flex gap-0.5">
              {post.platforms.slice(0, 6).map((p) => (
                <PlatformIcon key={p.socialAccountId} platform={p.platform} size={16} />
              ))}
            </div>
            <span className="text-xs text-neutral-500">
              {fmtTime(post.scheduledAt ?? post.publishedAt ?? post.createdAt)}
            </span>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-neutral-500 hover:bg-neutral-100">
            ×
          </button>
        </div>
        <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-900">
          {post.type === 'reshare' && post.reshareSource ? (
            <span>
              <span className="font-medium">↻ from @{post.reshareSource.authorHandle}</span>
              <br />
              <span className="text-neutral-600">{post.reshareSource.preview}</span>
            </span>
          ) : (
            post.defaultContent || <span className="italic text-neutral-400">No content</span>
          )}
        </div>
        {post.campaignId && post.campaignName ? (
          <div className="mt-2 text-xs">
            <Link
              to="/$workspaceSlug/posts/campaigns/$campaignId"
              params={{ workspaceSlug, campaignId: post.campaignId }}
              className="text-indigo-600 hover:underline"
            >
              🎯 {post.campaignName} — open campaign
            </Link>
          </div>
        ) : null}

        {post.status !== 'published' ? (
          <div className="mt-3 flex items-center gap-2">
            <CalendarClock className="h-3 w-3 text-neutral-500" />
            <Input
              type="datetime-local"
              value={rescheduleAt}
              onChange={(e) => setRescheduleAt(e.target.value)}
              className="h-8 flex-1"
            />
            <Button size="sm" onClick={confirmReschedule} disabled={busy}>
              Reschedule
            </Button>
          </div>
        ) : null}

        <div className="mt-4 flex justify-between">
          {liveUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={liveUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" /> View on platform
              </a>
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" variant="outline" className="text-red-600" onClick={onDelete} disabled={busy}>
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
