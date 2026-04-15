import { Queue } from 'bullmq'
import { getRedis } from './connection'

export type AnalyticsJobData = {
  /** UTC date string (YYYY-MM-DD) the sync is attributed to. */
  date: string
  /** Optional workspace filter; omit to walk every workspace. */
  workspaceId?: string
  /** Optional single account filter — drives the "Sync now" button. */
  socialAccountId?: string
}

let queue: Queue<AnalyticsJobData> | null = null

export function getAnalyticsQueue(): Queue<AnalyticsJobData> {
  if (queue) return queue
  queue = new Queue<AnalyticsJobData>('analytics', {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 200 },
    },
  })
  return queue
}

export function resetAnalyticsQueue() {
  queue = null
}
