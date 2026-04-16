import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { limitsFor } from '~/lib/billing/limits'
import { PLATFORM_KEYS } from '~/lib/platforms'
import { suggestHashtagsImpl } from '~/server/ai.server'
import { requireWorkspaceAccess } from '~/server/session.server'

const bodySchema = z.object({
  workspaceSlug: z.string().min(1),
  content: z.string().min(1),
  platforms: z.array(z.enum(PLATFORM_KEYS)).optional().default([]),
})

export const Route = createFileRoute('/api/ai/hashtags')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const parsed = bodySchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 })
        }

        const access = await requireWorkspaceAccess(parsed.data.workspaceSlug)
        if (!access.ok) {
          return Response.json({ error: access.reason }, { status: 403 })
        }

        const limits = await limitsFor(access.workspace.id)
        if (!limits.aiAssistEnabled) {
          return Response.json({ error: 'AI assist is not available on your current plan' }, { status: 403 })
        }

        const hashtags = await suggestHashtagsImpl(
          parsed.data.content,
          parsed.data.platforms as never,
        )
        return Response.json({ hashtags })
      },
    },
  },
})
