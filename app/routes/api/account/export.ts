import { createFileRoute } from '@tanstack/react-router'
import { exportMyDataImpl } from '~/server/dataExport.server'

export const Route = createFileRoute('/api/account/export')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const data = await exportMyDataImpl()
          const filename = `nova-export-${new Date().toISOString().slice(0, 10)}.json`
          return new Response(JSON.stringify(data, null, 2), {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Cache-Control': 'no-store',
            },
          })
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Export failed'
          const status = message === 'Unauthorized' ? 401 : 500
          return Response.json({ error: message }, { status })
        }
      },
    },
  },
})
