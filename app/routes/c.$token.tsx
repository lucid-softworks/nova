import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  getSharedCalendarImpl,
  type SharedCalendar,
  type SharedCalendarPost,
} from '~/server/calendarFeed.server'

const tokenInput = z.object({ token: z.string().min(1).max(200) })

const fetchShared = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<SharedCalendar | null> => getSharedCalendarImpl(data.token))

export const Route = createFileRoute('/c/$token')({
  loader: async ({ params }) => {
    const data = await fetchShared({ data: { token: params.token } })
    if (!data) throw notFound()
    return data
  },
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: SharedCalendarPage,
})

function SharedCalendarPage() {
  const data = Route.useLoaderData()
  const grouped = groupByDay(data.posts)
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-neutral-100">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6">
          <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Shared schedule
          </div>
          <h1 className="text-2xl font-semibold">{data.workspaceName}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Upcoming scheduled and recently published posts. Read-only.
          </p>
        </header>
        {grouped.length === 0 ? (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Nothing scheduled or recently published in this window.
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((day) => (
              <section key={day.key}>
                <div className="sticky top-0 z-10 -mx-4 bg-neutral-50/90 px-4 py-2 backdrop-blur dark:bg-[#0b0d12]/90">
                  <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    {day.label}
                  </div>
                </div>
                <ul className="mt-1 space-y-2">
                  {day.items.map((p) => (
                    <PostCard key={p.id} post={p} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PostCard({ post }: { post: SharedCalendarPost }) {
  const when = post.scheduledAt ?? post.publishedAt
  return (
    <li className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {when ? new Date(when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </div>
        <StatusChip status={post.status} />
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
        {post.content || <em className="text-neutral-400">(no content)</em>}
      </p>
      {post.platforms.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {post.platforms.map((p) => (
            <span
              key={p}
              className="rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-400"
            >
              {p}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  )
}

function StatusChip({ status }: { status: string }) {
  const colors: Record<string, string> = {
    scheduled: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    publishing: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    published: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status] ?? 'bg-neutral-100 text-neutral-600'}`}
    >
      {status}
    </span>
  )
}

function groupByDay(posts: SharedCalendarPost[]) {
  const bucket = new Map<string, SharedCalendarPost[]>()
  for (const p of posts) {
    const when = p.scheduledAt ?? p.publishedAt
    if (!when) continue
    const d = new Date(when)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const arr = bucket.get(key) ?? []
    arr.push(p)
    bucket.set(key, arr)
  }
  return [...bucket.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, items]) => ({
      key,
      label: new Date(key + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      items: items.sort((x, y) => {
        const a = new Date(x.scheduledAt ?? x.publishedAt ?? 0).getTime()
        const b = new Date(y.scheduledAt ?? y.publishedAt ?? 0).getTime()
        return a - b
      }),
    }))
}
