import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { loadSessionContext } from '~/server/session.server'

async function requireAdmin(): Promise<Response | null> {
  const ctx = await loadSessionContext()
  if (!ctx.user) return new Response('Unauthorized', { status: 401 })
  const row = await db.query.user.findFirst({ where: eq(schema.user.id, ctx.user.id) })
  if (row?.role !== 'admin') return new Response('Forbidden', { status: 403 })
  return null
}

async function handle(request: Request): Promise<Response> {
  const guard = await requireAdmin()
  if (guard) return guard
  const { getBullBoardApp } = await import('~/server/bullBoard.server')
  return getBullBoardApp().fetch(request)
}

// Base path of the bull-board UI. The queues.$ splat handles every path
// under this one; this index handler covers the bare /api/admin/queues
// (with or without trailing slash) so hitting the nav link loads the UI.
export const Route = createFileRoute('/api/admin/queues/')({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
})
