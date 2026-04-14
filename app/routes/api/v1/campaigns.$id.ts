import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import {
  apiError,
  apiResponse,
  authFailureToResponse,
  authenticateApiRequest,
  rateLimit,
  withApiAuth,
} from '~/server/apiAuth'
import { db, schema } from '~/server/db'
import { getCampaignDetailImpl } from '~/server/posts.server'

export const Route = createFileRoute('/api/v1/campaigns/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        const rl = await rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)

        return withApiAuth(auth.ctx, async () => {
          const detail = await getCampaignDetailImpl(auth.ctx.workspaceSlug, params.id)
          if (!detail) return apiError('CAMPAIGN_NOT_FOUND', 'Campaign not found', 404)
          return apiResponse(detail)
        })
      },

      DELETE: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        const rl = await rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)

        const existing = await db.query.campaigns.findFirst({
          where: and(
            eq(schema.campaigns.id, params.id),
            eq(schema.campaigns.workspaceId, auth.ctx.workspaceId),
          ),
        })
        if (!existing) return apiError('CAMPAIGN_NOT_FOUND', 'Campaign not found', 404)
        await db.delete(schema.campaigns).where(eq(schema.campaigns.id, params.id))
        return apiResponse({ ok: true })
      },
    },
  },
})
