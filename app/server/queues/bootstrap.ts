import { getPostQueue, resetPostQueue } from './postQueue'
import { getPostWorker, resetPostWorker } from './worker'
import { startScheduler, stopScheduler } from './scheduler'
import { startAnalyticsSync } from './analyticsSync'

declare global {
  var __socialhubQueuesBooted: boolean | undefined
  var __socialhubQueueCleanup: (() => Promise<void>) | undefined
}

export function bootQueues() {
  if (globalThis.__socialhubQueuesBooted) return
  if (process.env.DISABLE_INLINE_WORKER === '1') {
    // Prod: web process doesn't run the worker; it's a separate `pnpm worker`
    // process. Set this in the web container only.
    return
  }
  if (!process.env.REDIS_URL) {
    console.warn('[queues] REDIS_URL missing — scheduler and worker disabled')
    return
  }
  globalThis.__socialhubQueuesBooted = true
  const queue = getPostQueue()
  const worker = getPostWorker()
  startScheduler()
  startAnalyticsSync()
  console.log('[queues] scheduler + worker online')

  globalThis.__socialhubQueueCleanup = async () => {
    stopScheduler()
    await worker.close()
    await queue.close()
    resetPostWorker()
    resetPostQueue()
    globalThis.__socialhubQueuesBooted = false
  }
}

// Vite HMR: when any queue module changes, tear down the running worker so the
// fresh module graph can boot a new one on the next request.
if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    const cleanup = globalThis.__socialhubQueueCleanup
    if (cleanup) {
      try {
        await cleanup()
        console.log('[queues] disposed for HMR')
      } catch (e) {
        console.error('[queues] dispose error', e)
      }
    }
  })
}
