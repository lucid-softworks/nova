import { Queue, Worker } from 'bullmq'
import { getRedis } from '~/server/queues/connection'
import { logger } from '~/lib/logger'
import { pollAllMonitors } from './poll'

export type MonitorJobData = Record<string, never>

const REPEAT_KEY = 'monitors:poll-all'

let queue: Queue<MonitorJobData> | null = null
let worker: Worker<MonitorJobData> | null = null

export function getMonitorQueue(): Queue<MonitorJobData> {
  if (!queue) {
    queue = new Queue<MonitorJobData>('monitors', {
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

export function getMonitorWorker(): Worker<MonitorJobData> {
  if (!worker) {
    worker = new Worker<MonitorJobData>(
      'monitors',
      async () => {
        await pollAllMonitors()
      },
      { connection: getRedis(), concurrency: 1 },
    )
  }
  return worker
}

export async function startMonitorPolling(): Promise<void> {
  const q = getMonitorQueue()
  await q.add(REPEAT_KEY, {} as MonitorJobData, {
    repeat: { pattern: '*/10 * * * *', tz: 'UTC' },
    jobId: REPEAT_KEY,
  })
  logger.info('keyword monitor polling scheduled')
}

export function resetMonitors() {
  queue = null
  worker = null
}
