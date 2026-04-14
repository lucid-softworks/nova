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
import { uploadMediaImpl } from '~/server/composer.server'
import { listAssetsImpl } from '~/server/media.server'

const listSchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  search: z.string().optional(),
  filter: z.enum(['all', 'image', 'video', 'gif']).optional(),
  sort: z.enum(['date_desc', 'date_asc', 'name', 'size']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const Route = createFileRoute('/api/v1/media')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        const rl = rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)

        const url = new URL(request.url)
        const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          return apiError('BAD_REQUEST', 'Invalid query parameters', 400, {
            issues: parsed.error.flatten(),
          })
        }

        return withApiAuth(auth.ctx, async () => {
          const rows = await listAssetsImpl({
            workspaceSlug: auth.ctx.workspaceSlug,
            folderId: parsed.data.folderId ?? null,
            search: parsed.data.search ?? null,
            filter: parsed.data.filter ?? 'all',
            sort: parsed.data.sort ?? 'date_desc',
          })
          const offset = parsed.data.offset ?? 0
          const limit = parsed.data.limit ?? 50
          return apiResponse(rows.slice(offset, offset + limit), {
            total: rows.length,
            limit,
            offset,
          })
        })
      },

      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        const rl = rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)

        const url = new URL(request.url)
        const folderId = url.searchParams.get('folderId')

        let form: FormData
        try {
          form = await request.formData()
        } catch {
          return apiError('BAD_REQUEST', 'Expected multipart/form-data', 400)
        }
        const file = form.get('file')
        if (!(file instanceof File)) {
          return apiError('BAD_REQUEST', 'file field required', 400)
        }
        return withApiAuth(auth.ctx, async () => {
          try {
            const asset = await uploadMediaImpl(auth.ctx.workspaceSlug, file, folderId)
            return apiResponse(asset)
          } catch (e) {
            return apiError(
              'MEDIA_UPLOAD_FAILED',
              e instanceof Error ? e.message : 'Upload failed',
              400,
            )
          }
        })
      },
    },
  },
})
