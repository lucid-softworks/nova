import { Worker } from 'bullmq'
import { Queue } from 'bullmq'
import { getRedis } from '~/server/queues/connection'
import { logger } from '~/lib/logger'
import { pollAllActive, pollFeed } from './poll'

export type RssJobData = { feedId?: string }

const REPEAT_KEY = 'rss:poll-all'

let queue: Queue<RssJobData> | null = null
let worker: Worker<RssJobData> | null = null

export function getRssQueue(): Queue<RssJobData> {
  if (!queue) {
    queue = new Queue<RssJobData>('rss', {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 2,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    })
  }
  return queue
}

export function getRssWorker(): Worker<RssJobData> {
  if (!worker) {
    worker = new Worker<RssJobData>(
      'rss',
      async (job) => {
        if (job.data.feedId) {
          const res = await pollFeed(job.data.feedId)
          logger.info({ feedId: job.data.feedId, ...res }, 'rss feed polled')
        } else {
          await pollAllActive()
        }
      },
      { connection: getRedis(), concurrency: 2 },
    )
  }
  return worker
}

export async function startRssPolling(): Promise<void> {
  const q = getRssQueue()
  await q.add(REPEAT_KEY, {}, {
    repeat: { pattern: '*/15 * * * *', tz: 'UTC' },
    jobId: REPEAT_KEY,
  })
}

export async function enqueueRssPoll(feedId: string): Promise<void> {
  const q = getRssQueue()
  await q.add('rss:one-off', { feedId })
}

export function resetRss() {
  queue = null
  worker = null
}
