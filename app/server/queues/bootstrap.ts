import { getPostQueue, resetPostQueue } from './postQueue'
import { getPostWorker, resetPostWorker } from './worker'
import { startScheduler, stopScheduler } from './scheduler'
import { startAnalyticsSync } from './analyticsSync'
import { getAnalyticsQueue, resetAnalyticsQueue } from './analyticsQueue'
import { getAnalyticsWorker, resetAnalyticsWorker } from './analyticsWorker'
import {
  getRssQueue,
  getRssWorker,
  resetRss,
  startRssPolling,
} from '~/server/rss/schedule'
import {
  getInboxQueue,
  getInboxWorker,
  resetInbox,
  startInboxPolling,
} from '~/server/inbox/schedule'
import {
  getDigestQueue,
  getDigestWorker,
  resetDigest,
  startDigestSchedule,
} from '~/server/digests/schedule'
import {
  getRecurringQueue,
  getRecurringWorker,
  resetRecurring,
  startRecurringPolling,
} from '~/server/recurring/schedule'
import { logger } from '~/lib/logger'
import { initSentry } from '~/lib/sentry'

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
    logger.warn('REDIS_URL missing — scheduler and worker disabled')
    return
  }
  initSentry()
  globalThis.__socialhubQueuesBooted = true
  const queue = getPostQueue()
  const worker = getPostWorker()
  const analyticsQueue = getAnalyticsQueue()
  const analyticsWorker = getAnalyticsWorker()
  const rssQueue = getRssQueue()
  const rssWorker = getRssWorker()
  const inboxQueue = getInboxQueue()
  const inboxWorker = getInboxWorker()
  const digestQueue = getDigestQueue()
  const digestWorker = getDigestWorker()
  const recurringQueue = getRecurringQueue()
  const recurringWorker = getRecurringWorker()
  startScheduler()
  startAnalyticsSync().catch((e) =>
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'analytics schedule failed'),
  )
  startRssPolling().catch((e) =>
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'rss schedule failed'),
  )
  startInboxPolling().catch((e) =>
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'inbox schedule failed'),
  )
  startDigestSchedule().catch((e) =>
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'digest schedule failed'),
  )
  startRecurringPolling().catch((e) =>
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'recurring schedule failed'),
  )
  logger.info('queues online: posts + analytics + rss + inbox + digest + recurring + scheduler')
  void rssQueue
  void rssWorker
  void inboxQueue
  void inboxWorker
  void digestQueue
  void digestWorker
  void recurringQueue
  void recurringWorker

  globalThis.__socialhubQueueCleanup = async () => {
    stopScheduler()
    await Promise.all([
      worker.close(),
      analyticsWorker.close(),
      rssWorker.close(),
      inboxWorker.close(),
      digestWorker.close(),
      recurringWorker.close(),
    ])
    await Promise.all([
      queue.close(),
      analyticsQueue.close(),
      rssQueue.close(),
      inboxQueue.close(),
      digestQueue.close(),
      recurringQueue.close(),
    ])
    resetPostWorker()
    resetPostQueue()
    resetAnalyticsWorker()
    resetAnalyticsQueue()
    resetRss()
    resetInbox()
    resetDigest()
    resetRecurring()
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
        logger.info('queues disposed for HMR')
      } catch (e) {
        logger.error({ err: e instanceof Error ? e.message : String(e) }, 'queues dispose error')
      }
    }
  })
}
