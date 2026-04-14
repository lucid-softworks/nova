import { createFileRoute } from '@tanstack/react-router'
import { uploadMediaImpl } from '~/server/composer.server'

export const Route = createFileRoute('/api/media/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceSlug = url.searchParams.get('workspaceSlug')
        if (!workspaceSlug) return Response.json({ error: 'workspaceSlug required' }, { status: 400 })

        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return Response.json({ error: 'file required' }, { status: 400 })

        try {
          const asset = await uploadMediaImpl(workspaceSlug, file)
          return Response.json(asset)
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Upload failed'
          return Response.json({ error: message }, { status: 400 })
        }
      },
    },
  },
})
