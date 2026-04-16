import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildAnalyticsPdf } from '~/server/reports.server'
import type { AnalyticsRange, CustomRange } from '~/server/analytics.server'

const querySchema = z.object({
  workspaceSlug: z.string().min(1),
  range: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
  accountId: z.string().uuid().nullable().default(null),
  fromIso: z.string().nullable().default(null),
  toIso: z.string().nullable().default(null),
})

export const Route = createFileRoute('/api/reports/analytics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 })
        }
        const q = parsed.data

        const custom: CustomRange =
          q.range === 'custom' && q.fromIso && q.toIso
            ? { fromIso: q.fromIso, toIso: q.toIso }
            : null

        const pdf = await buildAnalyticsPdf(
          q.workspaceSlug,
          q.range as AnalyticsRange,
          q.accountId,
          custom,
        )

        const date = new Date().toISOString().slice(0, 10)
        const filename = `analytics-${q.workspaceSlug}-${date}.pdf`

        return new Response(new Uint8Array(pdf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
