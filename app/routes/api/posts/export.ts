import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { exportPostsCsvImpl } from '~/server/csv.server'
import { PLATFORM_KEYS, type PlatformKey } from '~/lib/platforms'

const querySchema = z.object({
  workspaceSlug: z.string().min(1),
  tab: z
    .enum(['all', 'scheduled', 'published', 'drafts', 'pending_approval', 'failed', 'queue'])
    .default('all'),
  search: z.string().nullable().default(null),
  platforms: z.string().default(''),
  type: z.enum(['all', 'original', 'reshare']).default('all'),
  authorId: z.string().nullable().default(null),
  fromIso: z.string().nullable().default(null),
  toIso: z.string().nullable().default(null),
})

export const Route = createFileRoute('/api/posts/export')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 })
        }
        const q = parsed.data
        const platforms = q.platforms
          .split(',')
          .map((s) => s.trim())
          .filter((s): s is PlatformKey => (PLATFORM_KEYS as readonly string[]).includes(s))

        const csv = await exportPostsCsvImpl({
          workspaceSlug: q.workspaceSlug,
          tab: q.tab,
          search: q.search,
          platforms,
          type: q.type,
          authorId: q.authorId,
          fromIso: q.fromIso,
          toIso: q.toIso,
        })

        const filename = `posts-${new Date().toISOString().slice(0, 10)}.csv`
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
