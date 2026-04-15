/**
 * Standalone BullMQ worker entrypoint. Runs the scheduler + post-publishing
 * worker + analytics sync worker outside the web process. Set
 * `DISABLE_INLINE_WORKER=1` on the web deployment and run this process
 * separately (one or many replicas — BullMQ handles coordination via
 * Redis).
 */
import 'dotenv/config'
import { getPostQueue } from './server/queues/postQueue'
import { getPostWorker } from './server/queues/worker'
import { getAnalyticsQueue } from './server/queues/analyticsQueue'
import { getAnalyticsWorker } from './server/queues/analyticsWorker'
import { startScheduler, stopScheduler } from './server/queues/scheduler'
import { startAnalyticsSync } from './server/queues/analyticsSync'
import { getRssQueue, getRssWorker, startRssPolling } from './server/rss/schedule'
import {
  getInboxQueue,
  getInboxWorker,
  startInboxPolling,
} from './server/inbox/schedule'
import {
  getDigestQueue,
  getDigestWorker,
  startDigestSchedule,
} from './server/digests/schedule'
import { logger } from './lib/logger'
import { initSentry } from './lib/sentry'

if (!process.env.REDIS_URL) {
  logger.fatal('REDIS_URL is required for the worker')
  process.exit(1)
}

initSentry()

const postQueue = getPostQueue()
const postWorker = getPostWorker()
const analyticsQueue = getAnalyticsQueue()
const analyticsWorker = getAnalyticsWorker()
const rssQueue = getRssQueue()
const rssWorker = getRssWorker()
const inboxQueue = getInboxQueue()
const inboxWorker = getInboxWorker()
const digestQueue = getDigestQueue()
const digestWorker = getDigestWorker()
startScheduler()
// Scheduling the repeatables is idempotent — BullMQ dedupes on the jobId,
// so running this on every worker boot (any replica count) is safe.
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
logger.info(
  { replicaId: process.env.HOSTNAME ?? 'local' },
  'worker online: posts + analytics + rss + inbox + digest + scheduler',
)

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'worker draining')
  stopScheduler()
  try {
    await Promise.all([
      postWorker.close(),
      analyticsWorker.close(),
      rssWorker.close(),
      inboxWorker.close(),
      digestWorker.close(),
    ])
    await Promise.all([
      postQueue.close(),
      analyticsQueue.close(),
      rssQueue.close(),
      inboxQueue.close(),
      digestQueue.close(),
    ])
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, 'worker drain error')
  }
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
