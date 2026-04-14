import { createFileRoute } from '@tanstack/react-router'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

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
        const dir = process.env.STORAGE_LOCAL_PATH ?? './storage'
        const abs = path.join(dir, params.filename)
        try {
          await stat(abs)
          const body = await readFile(abs)
          const ext = path.extname(params.filename).toLowerCase()
          const type = MIME[ext] ?? 'application/octet-stream'
          return new Response(body, {
            headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' },
          })
        } catch {
          return new Response('Not found', { status: 404 })
        }
      },
    },
  },
})
