import { getAnalyticsQueue } from './analyticsQueue'

const REPEAT_JOB_KEY = 'analytics:daily'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Register the 02:00 UTC repeatable job. Idempotent — BullMQ dedupes on the
 * provided key, so repeated calls (HMR, multi-boot) don't pile up schedules.
 */
export async function startAnalyticsSync(): Promise<void> {
  const queue = getAnalyticsQueue()
  await queue.add(
    REPEAT_JOB_KEY,
    { date: todayIso() },
    {
      repeat: { pattern: '0 2 * * *', tz: 'UTC' },
      jobId: REPEAT_JOB_KEY,
    },
  )
}

/**
 * Enqueue a one-off sync, used by the admin "Sync now" action.
 * `workspaceId` and `socialAccountId` are optional filters.
 */
export async function enqueueManualSync(opts: {
  workspaceId?: string
  socialAccountId?: string
}): Promise<void> {
  const queue = getAnalyticsQueue()
  await queue.add('analytics:manual', {
    date: todayIso(),
    workspaceId: opts.workspaceId,
    socialAccountId: opts.socialAccountId,
  })
}
