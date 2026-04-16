import { Queue, Worker } from 'bullmq'
import { getRedis } from '~/server/queues/connection'
import { logger } from '~/lib/logger'
import { tickRecurringPosts } from './tick'

export type RecurringJobData = Record<string, never>

const REPEAT_KEY = 'recurring:tick'

let queue: Queue<RecurringJobData> | null = null
let worker: Worker<RecurringJobData> | null = null

export function getRecurringQueue(): Queue<RecurringJobData> {
  if (!queue) {
    queue = new Queue<RecurringJobData>('recurring', {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    })
  }
  return queue
}

export function getRecurringWorker(): Worker<RecurringJobData> {
  if (!worker) {
    worker = new Worker<RecurringJobData>(
      'recurring',
      async () => {
        await tickRecurringPosts()
      },
      { connection: getRedis(), concurrency: 1 },
    )
  }
  return worker
}

export async function startRecurringPolling(): Promise<void> {
  const q = getRecurringQueue()
  await q.add(REPEAT_KEY, {} as RecurringJobData, {
    repeat: { pattern: '* * * * *', tz: 'UTC' },
    jobId: REPEAT_KEY,
  })
  logger.info('recurring-posts polling scheduled')
}

export function resetRecurring() {
  queue = null
  worker = null
}
