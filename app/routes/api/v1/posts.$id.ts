import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  apiError,
  apiResponse,
  authFailureToResponse,
  authenticateApiRequest,
  rateLimit,
  withApiAuth,
} from '~/server/apiAuth'
import { db, schema } from '~/server/db'
import { deletePostsImpl } from '~/server/posts.server'

const patchSchema = z.object({
  status: z.enum(['draft', 'scheduled', 'pending_approval']).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  labels: z.array(z.string().max(100)).max(50).optional(),
}).strict()

async function loadPost(workspaceId: string, postId: string) {
  const post = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.workspaceId, workspaceId)),
  })
  if (!post) return null
  const versions = await db
    .select()
    .from(schema.postVersions)
    .where(eq(schema.postVersions.postId, postId))
  const targets = await db
    .select({
      socialAccountId: schema.postPlatforms.socialAccountId,
      status: schema.postPlatforms.status,
      publishedUrl: schema.postPlatforms.publishedUrl,
      platformPostId: schema.postPlatforms.platformPostId,
      publishedAt: schema.postPlatforms.publishedAt,
    })
    .from(schema.postPlatforms)
    .where(eq(schema.postPlatforms.postId, postId))
  const activity = await db
    .select()
    .from(schema.postActivity)
    .where(eq(schema.postActivity.postId, postId))
  return { post, versions, targets, activity }
}

export const Route = createFileRoute('/api/v1/posts/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        const rl = await rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)

        const loaded = await loadPost(auth.ctx.workspaceId, params.id)
        if (!loaded) return apiError('POST_NOT_FOUND', 'Post not found', 404)
        return apiResponse(loaded)
      },

      PATCH: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        if (auth.ctx.role === 'viewer') return apiError('FORBIDDEN', 'Viewers cannot update posts', 403)
        const rl = await rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return apiError('BAD_REQUEST', 'Invalid JSON body', 400)
        }
        const parsed = patchSchema.safeParse(body)
        if (!parsed.success) {
          return apiError('VALIDATION_ERROR', parsed.error.issues.map((i) => i.message).join('; '), 400)
        }
        const patch = parsed.data
        const exists = await db.query.posts.findFirst({
          where: and(
            eq(schema.posts.id, params.id),
            eq(schema.posts.workspaceId, auth.ctx.workspaceId),
          ),
        })
        if (!exists) return apiError('POST_NOT_FOUND', 'Post not found', 404)
        await db
          .update(schema.posts)
          .set({
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.scheduledAt !== undefined
              ? { scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt) : null }
              : {}),
            ...(patch.labels ? { labels: patch.labels } : {}),
            updatedAt: new Date(),
          })
          .where(eq(schema.posts.id, params.id))
        return apiResponse({ id: params.id })
      },

      DELETE: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request)
        if (!auth.ok) return authFailureToResponse(auth.err)
        if (auth.ctx.role === 'viewer') return apiError('FORBIDDEN', 'Viewers cannot delete posts', 403)
        const rl = await rateLimit(`ws:${auth.ctx.workspaceId}`)
        if (!rl.ok) return apiError('RATE_LIMITED', 'Too many requests', 429)

        return withApiAuth(auth.ctx, async () => {
          try {
            await deletePostsImpl(auth.ctx.workspaceSlug, [params.id])
            return apiResponse({ ok: true })
          } catch (e) {
            return apiError(
              'POST_DELETE_FAILED',
              e instanceof Error ? e.message : 'Failed to delete',
              400,
            )
          }
        })
      },
    },
  },
})
