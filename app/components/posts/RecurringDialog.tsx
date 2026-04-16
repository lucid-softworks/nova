import { useState, useEffect } from 'react'
import { RotateCw, Trash2, Pause, Play } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { useT } from '~/lib/i18n'
import { cn } from '~/lib/utils'
import {
  createRecurring,
  listRecurring,
  updateRecurring,
  deleteRecurring,
  type RecurringRow,
} from '~/server/recurring'
import type { AccountSummary } from '~/server/accounts'

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
]

type CronPreset = {
  i18nKey: string
  expr: string
}

const CRON_PRESETS: CronPreset[] = [
  { i18nKey: 'recurring.daily', expr: '0 9 * * *' },
  { i18nKey: 'recurring.weekdays', expr: '0 9 * * 1-5' },
  { i18nKey: 'recurring.weekly', expr: '0 9 * * 1' },
  { i18nKey: 'recurring.monthly', expr: '0 9 1 * *' },
]

export function RecurringDialog({
  open,
  onOpenChange,
  workspaceSlug,
  postId,
  accounts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceSlug: string
  postId: string
  accounts: AccountSummary[]
}) {
  const t = useT()
  const [cronExpr, setCronExpr] = useState('0 9 * * *')
  const [customMode, setCustomMode] = useState(false)
  const [timezone, setTimezone] = useState('UTC')
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState<RecurringRow[]>([])
  const [loadingRules, setLoadingRules] = useState(false)

  const connectedAccounts = accounts.filter((a) => a.status === 'connected')

  const loadRules = async () => {
    setLoadingRules(true)
    try {
      const rows = await listRecurring({ data: { workspaceSlug } })
      setRules(rows.filter((r) => r.sourcePostId === postId))
    } finally {
      setLoadingRules(false)
    }
  }

  useEffect(() => {
    if (open) {
      void loadRules()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleCreate = async () => {
    if (selectedAccountIds.length === 0) return
    setBusy(true)
    try {
      await createRecurring({
        data: {
          workspaceSlug,
          sourcePostId: postId,
          cronExpression: cronExpr,
          timezone,
          socialAccountIds: selectedAccountIds,
        },
      })
      setSelectedAccountIds([])
      setCronExpr('0 9 * * *')
      setCustomMode(false)
      await loadRules()
    } finally {
      setBusy(false)
    }
  }

  const handleToggleActive = async (rule: RecurringRow) => {
    setBusy(true)
    try {
      await updateRecurring({
        data: {
          workspaceSlug,
          id: rule.id,
          active: !rule.active,
        },
      })
      await loadRules()
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (rule: RecurringRow) => {
    if (!confirm(t('recurring.deleteConfirm'))) return
    setBusy(true)
    try {
      await deleteRecurring({ data: { workspaceSlug, id: rule.id } })
      await loadRules()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCw className="h-4 w-4" />
            {t('recurring.title')}
          </DialogTitle>
          <DialogDescription>{t('recurring.description')}</DialogDescription>
        </DialogHeader>

        {/* Create form */}
        <div className="space-y-4">
          {/* Cron presets */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.expr}
                  type="button"
                  onClick={() => {
                    setCronExpr(p.expr)
                    setCustomMode(false)
                  }}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    !customMode && cronExpr === p.expr
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300',
                  )}
                >
                  {t(p.i18nKey)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  customMode
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300',
                )}
              >
                {t('recurring.custom')}
              </button>
            </div>
            {customMode ? (
              <Input
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="0 9 * * *"
                className="font-mono text-sm"
              />
            ) : null}
          </div>

          {/* Timezone */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              {t('recurring.timezone')}
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-9 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 text-sm"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {/* Account selection */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              {t('recurring.selectAccounts')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {connectedAccounts.map((a) => {
                const on = selectedAccountIds.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAccount(a.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      on
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300',
                    )}
                  >
                    <PlatformIcon platform={a.platform} size={14} />
                    {a.accountName || a.accountHandle}
                  </button>
                )
              })}
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={busy || selectedAccountIds.length === 0}
            className="w-full"
          >
            {busy ? <Spinner /> : <RotateCw className="h-3.5 w-3.5" />}
            {t('recurring.create')}
          </Button>
        </div>

        {/* Existing rules */}
        <div className="space-y-2 border-t border-neutral-200 dark:border-neutral-800 pt-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t('recurring.activeRules')}
          </h3>
          {loadingRules ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : rules.length === 0 ? (
            <p className="py-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
              {t('recurring.noRules')}
            </p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={cn(
                    'flex items-center gap-3 rounded-md border p-2.5 text-sm',
                    rule.active
                      ? 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
                      : 'border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 opacity-60',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
                      {rule.cronExpression}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                      <span>{rule.timezone}</span>
                      <span>·</span>
                      <span>
                        {rule.socialAccountIds.length} {rule.socialAccountIds.length === 1 ? 'account' : 'accounts'}
                      </span>
                      {rule.nextFireAt ? (
                        <>
                          <span>·</span>
                          <span>
                            {t('recurring.nextFire')}: {new Date(rule.nextFireAt).toLocaleString()}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(rule)}
                      disabled={busy}
                      className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      title={rule.active ? t('recurring.pause') : t('recurring.resume')}
                    >
                      {rule.active ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule)}
                      disabled={busy}
                      className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                      title={t('recurring.delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
