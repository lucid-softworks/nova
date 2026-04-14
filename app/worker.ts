/**
 * Standalone BullMQ worker entrypoint. Runs the scheduler + post-publishing
 * worker outside the web process. In dev these also boot inline via
 * `queues/bootstrap.ts` on the first authenticated request; in prod set
 * `DISABLE_INLINE_WORKER=1` on the web process and run `pnpm worker`
 * separately (or your container-orchestrator equivalent).
 */
import 'dotenv/config'
import { getPostQueue } from './server/queues/postQueue'
import { getPostWorker } from './server/queues/worker'
import { startScheduler, stopScheduler } from './server/queues/scheduler'
import { startAnalyticsSync } from './server/queues/analyticsSync'

if (!process.env.REDIS_URL) {
  console.error('[worker] REDIS_URL is required')
  process.exit(1)
}

const queue = getPostQueue()
const worker = getPostWorker()
startScheduler()
startAnalyticsSync()
console.log('[worker] scheduler + processor online')

const shutdown = async (signal: string) => {
  console.log(`[worker] ${signal} received; draining`)
  stopScheduler()
  try {
    await worker.close()
    await queue.close()
  } catch (e) {
    console.error('[worker] drain error', e)
  }
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
