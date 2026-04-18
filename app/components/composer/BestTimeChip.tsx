import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { useT } from '~/lib/i18n'
import { getOptimalTimes, type OptimalSlot } from '~/server/optimalTime'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function nextOccurrence(dow: number, hour: number): Date {
  const now = new Date()
  const d = new Date(now)
  d.setUTCHours(hour, 0, 0, 0)
  const diff = (dow - now.getUTCDay() + 7) % 7 || 7
  d.setUTCDate(d.getUTCDate() + diff)
  if (d <= now) d.setUTCDate(d.getUTCDate() + 7)
  return d
}

export function BestTimeChip({
  workspaceSlug,
  onPick,
}: {
  workspaceSlug: string
  onPick: (isoString: string) => void
}) {
  const t = useT()
  const [slots, setSlots] = useState<OptimalSlot[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || slots.length > 0) return
    getOptimalTimes({ data: { workspaceSlug, accountId: null } })
      .then((s) => setSlots(s.slice(0, 5)))
      .catch(() => {})
  }, [open, slots.length, workspaceSlug])

  if (slots.length === 0 && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
      >
        <Clock className="h-3 w-3" /> {t('compose.bestTime')}
      </button>
    )
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
      >
        <Clock className="h-3 w-3" /> {t('compose.bestTime')}
      </button>
      {open && slots.length > 0 ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 max-w-[calc(100vw-1rem)] rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {t('compose.topSlots')}
          </div>
          {slots.map((s) => (
            <button
              key={`${s.dayOfWeek}-${s.hour}`}
              type="button"
              onClick={() => {
                onPick(nextOccurrence(s.dayOfWeek, s.hour).toISOString())
                setOpen(false)
              }}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-white/10"
            >
              <span className="text-neutral-900 dark:text-neutral-100">
                {DAY_LABELS[s.dayOfWeek]} {String(s.hour).padStart(2, '0')}:00 UTC
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                ~{Math.round(s.avgEngagements)} eng
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
