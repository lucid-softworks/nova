import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { CalendarDays, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { useConfirm } from '~/components/ui/confirm'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '~/components/ui/dialog'
import {
  listContentSeries,
  createContentSeries,
  deleteContentSeries,
  applyContentSeries,
  type ContentSeriesRow,
  type ContentSeriesSlot,
} from '~/server/contentSeries'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/templates/series')({
  loader: async ({ params }) => {
    const series = await listContentSeries({ data: { workspaceSlug: params.workspaceSlug } })
    return { series }
  },
  component: SeriesPage,
})

function SeriesPage() {
  const t = useT()
  const confirm = useConfirm()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const [series, setSeries] = useState<ContentSeriesRow[]>(initial.series)
  const [createOpen, setCreateOpen] = useState(false)
  const [useTarget, setUseTarget] = useState<ContentSeriesRow | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const reload = async () =>
    setSeries(await listContentSeries({ data: { workspaceSlug } }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {t('series.title')}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('series.description')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t('series.create')}
        </Button>
      </div>

      {toast && (
        <div className="rounded-md bg-green-50 dark:bg-green-950/30 px-4 py-2 text-sm text-green-700 dark:text-green-300">
          {toast}
        </div>
      )}

      {series.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {t('series.noSeries')}
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((s) => (
            <SeriesCard
              key={s.id}
              series={s}
              onUse={() => setUseTarget(s)}
              onDelete={async () => {
                const ok = await confirm({
                  message: `Delete "${s.name}"?`,
                  destructive: true,
                })
                if (!ok) return
                await deleteContentSeries({ data: { workspaceSlug, seriesId: s.id } })
                await reload()
              }}
            />
          ))}
        </div>
      )}

      <CreateSeriesDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceSlug={workspaceSlug}
        onCreated={reload}
      />

      <UseSeriesDialog
        series={useTarget}
        onClose={() => setUseTarget(null)}
        workspaceSlug={workspaceSlug}
        onUsed={async (count) => {
          setUseTarget(null)
          setToast(t('series.created').replace('{count}', String(count)))
          setTimeout(() => setToast(null), 4000)
        }}
      />
    </div>
  )
}

// -- Series card -------------------------------------------------------------

function SeriesCard({
  series,
  onUse,
  onDelete,
}: {
  series: ContentSeriesRow
  onUse: () => void
  onDelete: () => Promise<void>
}) {
  const t = useT()
  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {series.name}
            </div>
            {series.isBuiltIn && (
              <span className="inline-block rounded bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-300">
                {t('series.builtIn')}
              </span>
            )}
          </div>
          {!series.isBuiltIn && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
              aria-label={t('series.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {series.description && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {series.description}
          </p>
        )}

        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {t('series.slots')}: {series.slots.length}
        </div>

        <ul className="max-h-32 space-y-1 overflow-auto text-xs text-neutral-600 dark:text-neutral-300">
          {series.slots.map((slot, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3 flex-shrink-0 text-neutral-400" />
              <span className="font-mono text-[11px]">
                +{slot.dayOffset}d {slot.timeOfDay}
              </span>
              <span className="truncate">{slot.contentHint}</span>
            </li>
          ))}
        </ul>

        <Button type="button" variant="outline" size="sm" onClick={onUse} className="w-full">
          <Sparkles className="h-3.5 w-3.5" /> {t('series.use')}
        </Button>
      </div>
    </Card>
  )
}

// -- Use dialog (date picker) ------------------------------------------------

function UseSeriesDialog({
  series,
  onClose,
  workspaceSlug,
  onUsed,
}: {
  series: ContentSeriesRow | null
  onClose: () => void
  workspaceSlug: string
  onUsed: (count: number) => Promise<void>
}) {
  const t = useT()
  const [startDate, setStartDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  )
  const [loading, setLoading] = useState(false)

  const handleUse = async () => {
    if (!series) return
    setLoading(true)
    try {
      const result = await applyContentSeries({
        data: { workspaceSlug, seriesId: series.id, startDate },
      })
      await onUsed(result.created)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!series} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{t('series.use')}: {series?.name}</DialogTitle>
        <DialogDescription>
          {t('series.description')}
        </DialogDescription>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t('series.startDate')}
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <Button onClick={handleUse} disabled={loading} className="w-full">
            {loading ? t('common.loading') : t('series.use')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// -- Create dialog -----------------------------------------------------------

function CreateSeriesDialog({
  open,
  onOpenChange,
  workspaceSlug,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceSlug: string
  onCreated: () => Promise<void>
}) {
  const t = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [slots, setSlots] = useState<ContentSeriesSlot[]>([
    { dayOffset: 0, timeOfDay: '09:00', contentHint: '', platforms: [] },
  ])
  const [loading, setLoading] = useState(false)

  const addSlot = () =>
    setSlots((s) => [
      ...s,
      {
        dayOffset: (s[s.length - 1]?.dayOffset ?? 0) + 1,
        timeOfDay: '09:00',
        contentHint: '',
        platforms: [],
      },
    ])

  const removeSlot = (idx: number) =>
    setSlots((s) => s.filter((_, i) => i !== idx))

  const updateSlot = (idx: number, patch: Partial<ContentSeriesSlot>) =>
    setSlots((s) => s.map((slot, i) => (i === idx ? { ...slot, ...patch } : slot)))

  const handleSubmit = async () => {
    if (!name.trim() || slots.some((s) => !s.contentHint.trim())) return
    setLoading(true)
    try {
      await createContentSeries({
        data: { workspaceSlug, name, description: description || null, slots },
      })
      onOpenChange(false)
      setName('')
      setDescription('')
      setSlots([{ dayOffset: 0, timeOfDay: '09:00', contentHint: '', platforms: [] }])
      await onCreated()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{t('series.create')}</DialogTitle>
        <DialogDescription>{t('series.description')}</DialogDescription>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              placeholder="My content series"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t('series.descriptionLabel')}
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              placeholder={t('series.descriptionPlaceholder')}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {t('series.slots')}
              </label>
              <Button type="button" variant="outline" size="sm" onClick={addSlot}>
                <Plus className="h-3 w-3" /> {t('series.addSlot')}
              </Button>
            </div>
            <div className="space-y-2">
              {slots.map((slot, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/50"
                >
                  <input
                    type="number"
                    min={0}
                    value={slot.dayOffset}
                    onChange={(e) =>
                      updateSlot(idx, { dayOffset: parseInt(e.target.value) || 0 })
                    }
                    className="w-14 rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                    title={t('series.dayOffsetTitle')}
                  />
                  <span className="text-xs text-neutral-400">d</span>
                  <input
                    type="time"
                    value={slot.timeOfDay}
                    onChange={(e) => updateSlot(idx, { timeOfDay: e.target.value })}
                    className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  <input
                    value={slot.contentHint}
                    onChange={(e) => updateSlot(idx, { contentHint: e.target.value })}
                    placeholder={t('series.contentHintPlaceholder')}
                    className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  {slots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSlot(idx)}
                      className="rounded p-1 text-neutral-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? t('common.loading') : t('series.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
