import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  apiError,
  apiResponse,
  authFailureToResponse,
  authenticateApiRequest,
  rateLimit,
  withApiAuth,
} from '~/server/apiAuth'
import { getSummaryImpl } from '~/server/analytics.server'

const querySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
  accountId: z.string().uuid().optional(),
})

export const Route = createFileRoute('/api/v1/analytics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        const rl = rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)
        const url = new URL(request.url)
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          return apiError('BAD_REQUEST', 'Invalid query parameters', 400, {
            issues: parsed.error.flatten(),
          })
        }
        return withApiAuth(auth.ctx, async () => {
          const summary = await getSummaryImpl(
            auth.ctx.workspaceSlug,
            parsed.data.range,
            parsed.data.accountId ?? null,
          )
          return apiResponse(summary)
        })
      },
    },
  },
})
