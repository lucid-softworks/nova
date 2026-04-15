import { createFileRoute } from '@tanstack/react-router'
import { buildFeedForTokenImpl } from '~/server/calendarFeed.server'

export const Route = createFileRoute('/api/calendar/$token/ics')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const body = await buildFeedForTokenImpl(params.token)
        if (!body) return new Response('Not found', { status: 404 })
        return new Response(body, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Cache-Control': 'private, max-age=300',
            'Content-Disposition': 'inline; filename="nova.ics"',
          },
        })
      },
    },
  },
})
