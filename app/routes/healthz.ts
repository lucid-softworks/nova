import { createFileRoute } from '@tanstack/react-router'

/**
 * Liveness + readiness probe. Returns 200 with a tiny JSON payload when
 * Postgres + (optionally) Redis answer. Returns 503 otherwise so
 * orchestrators can take the pod out of rotation.
 */
export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: async () => {
        const checks: Record<string, 'ok' | 'fail' | 'skipped'> = {
          db: 'skipped',
          redis: 'skipped',
        }
        let ok = true

        try {
          const { db } = await import('~/server/db')
          await db.execute('SELECT 1')
          checks.db = 'ok'
        } catch {
          checks.db = 'fail'
          ok = false
        }

        if (process.env.REDIS_URL) {
          try {
            const { getRedis } = await import('~/server/queues/connection')
            const pong = await getRedis().ping()
            checks.redis = pong === 'PONG' ? 'ok' : 'fail'
            if (checks.redis === 'fail') ok = false
          } catch {
            checks.redis = 'fail'
            ok = false
          }
        }

        return Response.json({ ok, checks }, { status: ok ? 200 : 503 })
      },
    },
  },
})
