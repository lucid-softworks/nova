import { createFileRoute } from '@tanstack/react-router'

// bull-board lives at /api/admin/queues/<everything> via the splat route
// in queues.$.ts. Hitting /api/admin/queues without the trailing slash
// would otherwise 404, so redirect to the canonical path.
export const Route = createFileRoute('/api/admin/queues/')({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: '/api/admin/queues/' },
        }),
    },
  },
})
