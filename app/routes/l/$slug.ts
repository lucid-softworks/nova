import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/l/$slug')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { resolveShortLinkImpl } = await import('~/server/shortLinks.server')
        const target = await resolveShortLinkImpl(params.slug)
        if (!target) return new Response('Not found', { status: 404 })
        return new Response(null, {
          status: 302,
          headers: { Location: target, 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
