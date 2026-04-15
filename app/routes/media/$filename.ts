import { createFileRoute } from '@tanstack/react-router'
import path from 'node:path'
import { getStorage } from '~/server/storage'

const ALLOWED = /^[a-zA-Z0-9._-]+$/

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
}

export const Route = createFileRoute('/media/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!ALLOWED.test(params.filename)) {
          return new Response('Not found', { status: 404 })
        }
        const storage = getStorage()
        if (storage.kind === 's3') {
          // Object storage is the source of truth; redirect to its public URL
          // (public bucket, custom CNAME, or R2.dev). The browser then caches
          // straight from the CDN without round-tripping through our server.
          return Response.redirect(storage.publicUrl(params.filename), 302)
        }
        try {
          const body = await storage.getBuffer(params.filename)
          const ext = path.extname(params.filename).toLowerCase()
          const type = MIME[ext] ?? 'application/octet-stream'
          return new Response(new Uint8Array(body), {
            headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' },
          })
        } catch {
          return new Response('Not found', { status: 404 })
        }
      },
    },
  },
})
