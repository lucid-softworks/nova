import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { HonoAdapter } from '@bull-board/hono'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Hono } from 'hono'
import { getPostQueue } from './queues/postQueue'
import { getAnalyticsQueue } from './queues/analyticsQueue'
import { getRssQueue } from './rss/schedule'
import { getInboxQueue } from './inbox/schedule'
import { getDigestQueue } from './digests/schedule'
import { getRecurringQueue } from './recurring/schedule'
import { getMonitorQueue } from './monitors/schedule'

const BASE_PATH = '/api/admin/queues'

let honoApp: Hono | null = null

/**
 * Lazy singleton — constructing queue instances is cheap (they're just
 * Redis wrappers) but we only want to touch them when an admin actually
 * opens /admin/queues.
 */
export function getBullBoardApp(): Hono {
  if (honoApp) return honoApp
  const adapter = new HonoAdapter(serveStatic)
  createBullBoard({
    queues: [
      new BullMQAdapter(getPostQueue()),
      new BullMQAdapter(getAnalyticsQueue()),
      new BullMQAdapter(getRssQueue()),
      new BullMQAdapter(getInboxQueue()),
      new BullMQAdapter(getDigestQueue()),
      new BullMQAdapter(getRecurringQueue()),
      new BullMQAdapter(getMonitorQueue()),
    ],
    serverAdapter: adapter,
  })
  adapter.setBasePath(BASE_PATH)
  honoApp = adapter.registerPlugin()
  return honoApp
}

export const BULL_BOARD_BASE_PATH = BASE_PATH
