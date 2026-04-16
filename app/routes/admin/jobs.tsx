import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { RotateCw } from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { getAdminJobStats, retryAdminJob, type AdminJobStats } from '~/server/admin'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/admin/jobs')({
  loader: async () => ({ stats: await getAdminJobStats() }),
  component: JobsPage,
})

function JobsPage() {
  const t = useT()
  const initial = Route.useLoaderData()
  const [stats, setStats] = useState<AdminJobStats>(initial.stats)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = async () => setStats(await getAdminJobStats())

  const onRetry = async (jobId: string, queue: 'posts' | 'analytics') => {
    setBusy(jobId)
    try {
      await retryAdminJob({ data: { jobId, queue } })
      await reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {stats.queues.map((q) => (
        <div key={q.queue}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {q.queue} queue
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            {([{ i18nKey: 'admin.waiting', field: 'waiting' }, { i18nKey: 'admin.active', field: 'active' }, { i18nKey: 'admin.delayed', field: 'delayed' }, { i18nKey: 'admin.completed', field: 'completed' }, { i18nKey: 'admin.failed', field: 'failed' }] as const).map(({ i18nKey, field }) => (
                <Card key={field}>
                  <div className="space-y-1 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      {t(i18nKey)}
                    </div>
                    <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{q[field]}</div>
                  </div>
                </Card>
              ))}
          </div>
        </div>
      ))}
      <Card>
        <div className="p-3">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('admin.failedJobs')}</h3>
          {stats.failedJobs.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('admin.nothingFailed')}</p>
          ) : (
            <div className="space-y-2">
              {stats.failedJobs.map((j) => (
                <div
                  key={`${j.queue}:${j.id}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-800 p-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-neutral-700 dark:text-neutral-200">
                      [{j.queue}] {j.name} · {j.id}
                    </div>
                    <div className="mt-0.5 break-all text-[11px] text-neutral-500 dark:text-neutral-400">
                      {j.dataJson}
                    </div>
                    <div className="mt-0.5 text-xs text-red-600">{j.failedReason}</div>
                    <div className="text-[11px] text-neutral-400 dark:text-neutral-500">
                      {j.attemptsMade} attempts · {new Date(j.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRetry(j.id, j.queue)}
                    disabled={busy === j.id}
                  >
                    <RotateCw className="h-3 w-3" /> {t('admin.retry')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
