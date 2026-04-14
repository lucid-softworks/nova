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
import { PLATFORM_KEYS } from '~/lib/platforms'
import { listPostsImpl } from '~/server/posts.server'
import { saveDraftImpl } from '~/server/composer.server'

const listQuerySchema = z.object({
  status: z
    .enum(['draft', 'scheduled', 'published', 'failed', 'pending_approval', 'publishing'])
    .optional(),
  type: z.enum(['original', 'reshare']).optional(),
  platform: z.enum(PLATFORM_KEYS).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const createSchema = z.object({
  mode: z.enum(['shared', 'independent']).default('shared'),
  socialAccountIds: z.array(z.string().uuid()).default([]),
  versions: z
    .array(
      z.object({
        platforms: z.array(z.enum(PLATFORM_KEYS)),
        content: z.string().max(100_000),
        firstComment: z.string().max(10_000).nullable().default(null),
        isThread: z.boolean().default(false),
        threadParts: z
          .array(z.object({ content: z.string(), mediaIds: z.array(z.string().uuid()) }))
          .default([]),
        mediaIds: z.array(z.string().uuid()).default([]),
        isDefault: z.boolean().default(true),
      }),
    )
    .min(1),
})

export const Route = createFileRoute('/api/v1/posts')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        const rl = await rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)

        const url = new URL(request.url)
        const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          return apiError('BAD_REQUEST', 'Invalid query parameters', 400, {
            issues: parsed.error.flatten(),
          })
        }

        const tab = parsed.data.status
          ? parsed.data.status === 'publishing'
            ? 'scheduled'
            : parsed.data.status === 'draft'
              ? 'drafts'
              : parsed.data.status
          : 'all'

        return withApiAuth(auth.ctx, async () => {
          const rows = await listPostsImpl({
            workspaceSlug: auth.ctx.workspaceSlug,
            tab,
            search: null,
            platforms: parsed.data.platform ? [parsed.data.platform] : [],
            type: parsed.data.type ?? 'all',
            authorId: null,
            fromIso: parsed.data.from ?? null,
            toIso: parsed.data.to ?? null,
          })
          const offset = parsed.data.offset ?? 0
          const limit = parsed.data.limit ?? 50
          const sliced = rows.slice(offset, offset + limit)
          return apiResponse(sliced, { total: rows.length, limit, offset })
        })
      },

      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        const rl = await rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return apiError('BAD_REQUEST', 'Invalid JSON body', 400)
        }
        const parsed = createSchema.safeParse(body)
        if (!parsed.success) {
          return apiError('BAD_REQUEST', 'Invalid post body', 400, {
            issues: parsed.error.flatten(),
          })
        }
        return withApiAuth(auth.ctx, async () => {
          try {
            const { postId } = await saveDraftImpl({
              workspaceSlug: auth.ctx.workspaceSlug,
              mode: parsed.data.mode,
              socialAccountIds: parsed.data.socialAccountIds,
              versions: parsed.data.versions.map((v) => ({
                platforms: v.platforms,
                content: v.content,
                firstComment: v.firstComment,
                isThread: v.isThread,
                threadParts: v.threadParts,
                mediaIds: v.mediaIds,
                isDefault: v.isDefault,
              })),
              reddit: null,
            })
            return apiResponse({ id: postId })
          } catch (e) {
            return apiError(
              'POST_CREATE_FAILED',
              e instanceof Error ? e.message : 'Failed to create',
              400,
            )
          }
        })
      },
    },
  },
})
