import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { RotateCw } from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { getAdminJobStats, retryAdminJob, type AdminJobStats } from '~/server/admin'

export const Route = createFileRoute('/admin/jobs')({
  loader: async () => ({ stats: await getAdminJobStats() }),
  component: JobsPage,
})

function JobsPage() {
  const initial = Route.useLoaderData()
  const [stats, setStats] = useState<AdminJobStats>(initial.stats)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = async () => setStats(await getAdminJobStats())

  const onRetry = async (jobId: string) => {
    setBusy(jobId)
    try {
      await retryAdminJob({ data: { jobId } })
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const counters = [
    { label: 'Waiting', value: stats.waiting },
    { label: 'Active', value: stats.active },
    { label: 'Delayed', value: stats.delayed },
    { label: 'Completed', value: stats.completed },
    { label: 'Failed', value: stats.failed },
  ]

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-5">
        {counters.map((c) => (
          <Card key={c.label}>
            <div className="space-y-1 p-3">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500">
                {c.label}
              </div>
              <div className="text-xl font-semibold text-neutral-900">{c.value}</div>
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="p-3">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Failed jobs</h3>
          {stats.failedJobs.length === 0 ? (
            <p className="text-xs text-neutral-500">Nothing failed.</p>
          ) : (
            <div className="space-y-2">
              {stats.failedJobs.map((j) => (
                <div
                  key={j.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-neutral-700">{j.name} · {j.id}</div>
                    <div className="mt-0.5 break-all text-[11px] text-neutral-500">
                      {j.dataJson}
                    </div>
                    <div className="mt-0.5 text-xs text-red-600">{j.failedReason}</div>
                    <div className="text-[11px] text-neutral-400">
                      {j.attemptsMade} attempts · {new Date(j.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRetry(j.id)}
                    disabled={busy === j.id}
                  >
                    <RotateCw className="h-3 w-3" /> Retry
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
