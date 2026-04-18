import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { useConfirm } from '~/components/ui/confirm'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { SettingsNav } from '~/components/settings/SettingsNav'
import {
  getPostingSchedule,
  setPostingSchedule,
  type PostingSchedule,
} from '~/server/settings'
import {
  ensureCalendarFeedToken,
  regenerateCalendarFeedToken,
  ensureShareCalendarToken,
  regenerateShareCalendarToken,
  revokeShareCalendarToken,
  getShareCalendarStatus,
} from '~/server/calendarFeed'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/schedule')({
  loader: async ({ params }) => {
    const [schedule, share] = await Promise.all([
      getPostingSchedule({ data: { workspaceSlug: params.workspaceSlug } }),
      getShareCalendarStatus({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    return { schedule, shareCalendarUrl: share.url }
  },
  component: SchedulePage,
})

function SchedulePage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const [schedule, setSchedule] = useState<PostingSchedule[]>(initial.schedule)
  const [draftTime, setDraftTime] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const update = (day: number, times: string[]) =>
    setSchedule((prev) => prev.map((s) => (s.dayOfWeek === day ? { ...s, times: times.sort() } : s)))

  const addSlot = (day: number) => {
    const value = draftTime[day]
    if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return
    const current = schedule.find((s) => s.dayOfWeek === day)?.times ?? []
    if (current.includes(value)) return
    update(day, [...current, value])
    setDraftTime((d) => ({ ...d, [day]: '' }))
  }

  const removeSlot = (day: number, time: string) => {
    const current = schedule.find((s) => s.dayOfWeek === day)?.times ?? []
    update(day, current.filter((t) => t !== time))
  }

  const copyMondayToAll = () => {
    const monday = schedule.find((s) => s.dayOfWeek === 1)?.times ?? []
    setSchedule((prev) => prev.map((s) => ({ ...s, times: [...monday] })))
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await setPostingSchedule({ data: { workspaceSlug, schedule } })
      setMessage(t('settings.saved'))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const upcoming = previewNextSlots(schedule, 5)

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="schedule" />
      <CalendarFeedCard workspaceSlug={workspaceSlug} />
      <ShareCalendarCard workspaceSlug={workspaceSlug} initialUrl={initial.shareCalendarUrl} />
      <Card>
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('schedule.postingSchedule')}</h3>
            <Button variant="outline" size="sm" onClick={copyMondayToAll}>
              {t('schedule.copyMondayToAll')}
            </Button>
          </div>
          {schedule
            .slice()
            .sort((a, b) => {
              // Show Mon first, Sun last
              const order = [1, 2, 3, 4, 5, 6, 0]
              return order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek)
            })
            .map((d) => (
              <div key={d.dayOfWeek} className="space-y-2 rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {DAY_LABELS[d.dayOfWeek]}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="time"
                      value={draftTime[d.dayOfWeek] ?? ''}
                      onChange={(e) =>
                        setDraftTime((prev) => ({ ...prev, [d.dayOfWeek]: e.target.value }))
                      }
                      className="h-8 w-32"
                    />
                    <Button size="sm" variant="outline" onClick={() => addSlot(d.dayOfWeek)}>
                      <Plus className="h-3 w-3" /> {t('schedule.add')}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.times.length === 0 ? (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">{t('schedule.noSlots')}</span>
                  ) : (
                    d.times.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => removeSlot(d.dayOfWeek, t)}
                          className="rounded hover:bg-indigo-100"
                          aria-label="Remove slot"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
          {message ? <p className="text-sm text-neutral-600 dark:text-neutral-300">{message}</p> : null}
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Spinner /> : null} {t('schedule.saveSchedule')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-2 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('schedule.next5Slots')}</h3>
          {upcoming.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('schedule.addSlotsAbove')}</p>
          ) : (
            <ul className={cn('text-sm text-neutral-700 dark:text-neutral-200')}>
              {upcoming.map((d) => (
                <li key={d.toISOString()} className="py-0.5">
                  {d.toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}

function previewNextSlots(schedule: PostingSchedule[], n: number): Date[] {
  const byDow = new Map<number, string[]>()
  for (const s of schedule) byDow.set(s.dayOfWeek, s.times.slice().sort())
  const now = new Date()
  const out: Date[] = []
  for (let i = 0; i < 14 && out.length < n; i++) {
    const day = new Date(now)
    day.setDate(day.getDate() + i)
    const times = byDow.get(day.getDay()) ?? []
    for (const t of times) {
      const parts = t.split(':')
      const hh = Number(parts[0] ?? 0)
      const mm = Number(parts[1] ?? 0)
      const slot = new Date(day)
      slot.setHours(hh, mm, 0, 0)
      if (slot.getTime() <= now.getTime()) continue
      out.push(slot)
      if (out.length === n) break
    }
  }
  return out
}


function CalendarFeedCard({ workspaceSlug }: { workspaceSlug: string }) {
  const t = useT()
  const confirm = useConfirm()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setBusy(true)
    try {
      const res = await ensureCalendarFeedToken({ data: { workspaceSlug } })
      setUrl(res.url)
    } finally {
      setBusy(false)
    }
  }

  const rotate = async () => {
    const ok = await confirm({
      message: t('schedule.invalidateConfirm'),
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await regenerateCalendarFeedToken({ data: { workspaceSlug } })
      setUrl(res.url)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('schedule.calendarFeed')}</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {t('schedule.calendarFeedDescription')}
          </p>
        </div>
        {url ? (
          <>
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? t('schedule.copied') : t('schedule.copyUrl')}
              </Button>
              <Button size="sm" variant="ghost" onClick={rotate} disabled={busy}>
                {t('schedule.regenerate')}
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" onClick={generate} disabled={busy}>
            {busy ? <Spinner /> : null} {t('schedule.generateFeedUrl')}
          </Button>
        )}
      </div>
    </Card>
  )
}

function ShareCalendarCard({
  workspaceSlug,
  initialUrl,
}: {
  workspaceSlug: string
  initialUrl: string | null
}) {
  const confirm = useConfirm()
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setBusy(true)
    try {
      const res = await ensureShareCalendarToken({ data: { workspaceSlug } })
      setUrl(res.url)
    } finally {
      setBusy(false)
    }
  }

  const rotate = async () => {
    const ok = await confirm({
      message: 'Rotating invalidates the existing shareable URL.',
      destructive: true,
      confirmLabel: 'Rotate',
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await regenerateShareCalendarToken({ data: { workspaceSlug } })
      setUrl(res.url)
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    const ok = await confirm({
      message: 'Revoke the shareable URL? Anyone using it will lose access.',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await revokeShareCalendarToken({ data: { workspaceSlug } })
      setUrl(null)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Shareable calendar URL
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            A read-only web page showing upcoming scheduled and recently published posts.
            Anyone with the link can view it — share with clients or stakeholders.
          </p>
        </div>
        {url ? (
          <>
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? 'Copied!' : 'Copy URL'}
              </Button>
              <Button size="sm" variant="ghost" onClick={rotate} disabled={busy}>
                Regenerate
              </Button>
              <Button size="sm" variant="ghost" onClick={revoke} disabled={busy} className="text-red-600">
                Revoke
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" onClick={generate} disabled={busy}>
            {busy ? <Spinner /> : null} Generate share URL
          </Button>
        )}
      </div>
    </Card>
  )
}
