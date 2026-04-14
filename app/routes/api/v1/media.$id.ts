import { createFileRoute } from '@tanstack/react-router'
import {
  apiError,
  apiResponse,
  authFailureToResponse,
  authenticateApiRequest,
  rateLimit,
  withApiAuth,
} from '~/server/apiAuth'
import { deleteAssetsImpl } from '~/server/media.server'

export const Route = createFileRoute('/api/v1/media/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        const rl = rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)

        return withApiAuth(auth.ctx, async () => {
          try {
            await deleteAssetsImpl(auth.ctx.workspaceSlug, [params.id])
            return apiResponse({ ok: true })
          } catch (e) {
            return apiError(
              'MEDIA_DELETE_FAILED',
              e instanceof Error ? e.message : 'Failed to delete',
              400,
            )
          }
        })
      },
    },
  },
})
