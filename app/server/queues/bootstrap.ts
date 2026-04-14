import { getPostQueue } from './postQueue'
import { getPostWorker } from './worker'
import { startScheduler } from './scheduler'
import { startAnalyticsSync } from './analyticsSync'

declare global {
  var __socialhubQueuesBooted: boolean | undefined
}

export function bootQueues() {
  if (globalThis.__socialhubQueuesBooted) return
  if (!process.env.REDIS_URL) {
    console.warn('[queues] REDIS_URL missing — scheduler and worker disabled')
    return
  }
  globalThis.__socialhubQueuesBooted = true
  getPostQueue()
  getPostWorker()
  startScheduler()
  startAnalyticsSync()
  console.log('[queues] scheduler + worker online')
}
