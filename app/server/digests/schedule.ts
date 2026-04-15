import { Queue, Worker } from 'bullmq'
import { getRedis } from '~/server/queues/connection'
import { logger } from '~/lib/logger'
import { sendDigestsForAll } from './send'

export type DigestJobData = Record<string, never>

const REPEAT_KEY = 'digest:weekly'

let queue: Queue<DigestJobData> | null = null
let worker: Worker<DigestJobData> | null = null

export function getDigestQueue(): Queue<DigestJobData> {
  if (!queue) {
    queue = new Queue<DigestJobData>('digest', {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    })
  }
  return queue
}

export function getDigestWorker(): Worker<DigestJobData> {
  if (!worker) {
    worker = new Worker<DigestJobData>(
      'digest',
      async () => {
        await sendDigestsForAll()
      },
      { connection: getRedis(), concurrency: 1 },
    )
  }
  return worker
}

export async function startDigestSchedule(): Promise<void> {
  const q = getDigestQueue()
  await q.add(REPEAT_KEY, {} as DigestJobData, {
    repeat: { pattern: '0 9 * * 1', tz: 'UTC' },
    jobId: REPEAT_KEY,
  })
  logger.info('digest schedule wired')
}

export function resetDigest() {
  queue = null
  worker = null
}
