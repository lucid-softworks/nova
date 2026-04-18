import { createFileRoute } from '@tanstack/react-router'
import { buildFeedForTokenImpl } from '~/server/calendarFeed.server'
import { rateLimit } from '~/server/apiAuth'

export const Route = createFileRoute('/api/calendar/$token/ics')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Per-IP rate limit blunts brute-force token enumeration. Tokens
        // are 192-bit random, but the infra should still refuse a scan.
        const ip =
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          request.headers.get('x-real-ip') ??
          'unknown'
        const gate = await rateLimit(`ics:${ip}`, { limit: 30, windowMs: 60_000 })
        if (!gate.ok) {
          return new Response('Rate limited', {
            status: 429,
            headers: { 'Retry-After': String(Math.ceil(gate.resetInMs / 1000)) },
          })
        }
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
