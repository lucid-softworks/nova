import { Queue, Worker } from 'bullmq'
import { getRedis } from '~/server/queues/connection'
import { logger } from '~/lib/logger'
import { pollAllInboxes } from './poll'

export type InboxJobData = Record<string, never>

const REPEAT_KEY = 'inbox:poll-all'

let queue: Queue<InboxJobData> | null = null
let worker: Worker<InboxJobData> | null = null

export function getInboxQueue(): Queue<InboxJobData> {
  if (!queue) {
    queue = new Queue<InboxJobData>('inbox', {
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

export function getInboxWorker(): Worker<InboxJobData> {
  if (!worker) {
    worker = new Worker<InboxJobData>(
      'inbox',
      async () => {
        await pollAllInboxes()
      },
      { connection: getRedis(), concurrency: 1 },
    )
  }
  return worker
}

export async function startInboxPolling(): Promise<void> {
  const q = getInboxQueue()
  await q.add(REPEAT_KEY, {} as InboxJobData, {
    repeat: { pattern: '*/5 * * * *', tz: 'UTC' },
    jobId: REPEAT_KEY,
  })
  logger.info('inbox polling scheduled')
}

export function resetInbox() {
  queue = null
  worker = null
}
