import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { PLATFORM_KEYS } from '~/lib/platforms'
import { startGeneration, type GenerateRequest } from '~/server/ai.server'
import { requireWorkspaceAccess } from '~/server/session.server'

const bodySchema = z.object({
  workspaceSlug: z.string().min(1),
  mode: z.enum(['generate', 'improve', 'hashtags']),
  platforms: z.array(z.enum(PLATFORM_KEYS)),
  tone: z.enum(['professional', 'casual', 'funny', 'persuasive', 'inspirational']).nullable(),
  length: z.enum(['short', 'medium', 'long']).nullable(),
  prompt: z.string().nullable(),
  existingContent: z.string().nullable(),
  improveAction: z
    .enum([
      'shorten',
      'more_engaging',
      'fix_grammar',
      'add_hashtags',
      'change_tone',
      'rewrite',
    ])
    .nullable(),
})

export const Route = createFileRoute('/api/ai/generate')({
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

        const req: GenerateRequest = {
          mode: parsed.data.mode,
          platforms: parsed.data.platforms,
          tone: parsed.data.tone,
          length: parsed.data.length,
          workspaceName: access.workspace.name,
          prompt: parsed.data.prompt,
          existingContent: parsed.data.existingContent,
          improveAction: parsed.data.improveAction,
        }

        try {
          const result = startGeneration(req)
          return result.toTextStreamResponse()
        } catch (e) {
          const message = e instanceof Error ? e.message : 'AI request failed'
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
