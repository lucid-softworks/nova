import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { limitsFor } from '~/lib/billing/limits'
import { PLATFORM_KEYS } from '~/lib/platforms'
import { startGeneration, type GenerateRequest } from '~/server/ai.server'
import { assertFeatureEnabled, requireWorkspaceAccess } from '~/server/session.server'

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

        try {
          await assertFeatureEnabled('aiAssist')
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : 'AI assist is disabled' },
            { status: 403 },
          )
        }

        const limits = await limitsFor(access.workspace.id)
        if (!limits.aiAssistEnabled) {
          return Response.json({ error: 'AI assist is not available on your current plan' }, { status: 403 })
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

        let result: Awaited<ReturnType<typeof startGeneration>>
        try {
          result = await startGeneration(req, access.workspace.id)
        } catch (e) {
          const message = e instanceof Error ? e.message : 'AI request failed'
          return Response.json({ error: message }, { status: 500 })
        }

        // Use fullStream so provider errors (401, 429 quota, etc.) come
        // through as explicit error events instead of silently closing
        // the stream. toTextStreamResponse()/textStream alone swallow
        // some of those paths.
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const encoder = new TextEncoder()
            const emitError = (err: unknown) => {
              const msg =
                err instanceof Error
                  ? err.message
                  : typeof err === 'object' && err !== null && 'message' in err
                    ? String((err as { message: unknown }).message)
                    : String(err)
              controller.enqueue(
                encoder.encode(`\n\n[${result.providerLabel} error: ${msg}]`),
              )
            }
            try {
              for await (const part of result.result.fullStream) {
                if (part.type === 'text-delta') {
                  controller.enqueue(encoder.encode(part.textDelta))
                } else if (part.type === 'error') {
                  emitError(part.error)
                }
              }
            } catch (err) {
              emitError(err)
            }
            if (result.errorBox.current) emitError(result.errorBox.current)
            controller.close()
          },
        })
        return new Response(stream, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      },
    },
  },
})
