import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { listWorkspaceActivityImpl } from '~/server/posts.server'
import { toCsv } from '~/lib/csv'

const querySchema = z.object({
  workspaceSlug: z.string().min(1),
  fromIso: z.string().optional(),
  toIso: z.string().optional(),
  userId: z.string().optional(),
  format: z.enum(['csv', 'json']).default('csv'),
})

export const Route = createFileRoute('/api/activity/export')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 })
        }
        const q = parsed.data
        const rows = await listWorkspaceActivityImpl(q.workspaceSlug, {
          fromIso: q.fromIso ?? null,
          toIso: q.toIso ?? null,
          userId: q.userId ?? null,
          limit: 10000,
        })

        const dateStamp = new Date().toISOString().slice(0, 10)
        if (q.format === 'json') {
          return new Response(JSON.stringify(rows, null, 2), {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Disposition': `attachment; filename="activity-${dateStamp}.json"`,
              'Cache-Control': 'no-store',
            },
          })
        }

        const csv = `\ufeff${toCsv([
          ['timestamp', 'action', 'actor', 'postId', 'postContent', 'note'],
          ...rows.map((r) => [
            r.createdAt,
            r.action,
            r.userName ?? '',
            r.postId,
            r.postContent ?? '',
            r.note ?? '',
          ]),
        ])}`
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="activity-${dateStamp}.csv"`,
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
