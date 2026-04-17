import { createFileRoute } from '@tanstack/react-router'
import { exportUsersCsvImpl } from '~/server/admin.server'

export const Route = createFileRoute('/api/admin/users/export')({
  server: {
    handlers: {
      POST: async () => {
        const csv = await exportUsersCsvImpl()
        const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
