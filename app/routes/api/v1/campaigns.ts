import { createFileRoute } from '@tanstack/react-router'
import {
  apiError,
  apiResponse,
  authFailureToResponse,
  authenticateApiRequest,
  rateLimit,
  withApiAuth,
} from '~/server/apiAuth'
import { listCampaignsImpl } from '~/server/posts.server'

export const Route = createFileRoute('/api/v1/campaigns')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        const rl = await rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)
        return withApiAuth(auth.ctx, async () => {
          const list = await listCampaignsImpl(auth.ctx.workspaceSlug)
          return apiResponse(list, { total: list.length })
        })
      },
    },
  },
})
