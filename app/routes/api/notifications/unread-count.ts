import { createFileRoute } from '@tanstack/react-router'
import { unreadCountImpl } from '~/server/notifications.server'

export const Route = createFileRoute('/api/notifications/unread-count')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const count = await unreadCountImpl()
          return Response.json({ count })
        } catch {
          return Response.json({ count: 0 }, { status: 200 })
        }
      },
    },
  },
})
