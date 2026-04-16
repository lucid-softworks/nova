import { createFileRoute } from '@tanstack/react-router'
import { suggestHashtagsImpl } from '~/server/ai.server'

export const Route = createFileRoute('/api/ai/hashtags')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          content?: string
          platforms?: string[]
        }
        if (!body.content) {
          return Response.json({ hashtags: [] })
        }
        const hashtags = await suggestHashtagsImpl(
          body.content,
          (body.platforms ?? []) as never,
        )
        return Response.json({ hashtags })
      },
    },
  },
})
