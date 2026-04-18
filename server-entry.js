// Thin Node adapter: takes the fetch-style handler TanStack Start emits at
// dist/server/server.js and binds it to @hono/node-server so `pnpm start`
// actually listens on a port.
//
// We keep this tiny and JS (not TS) so it doesn't need compiling; it's just
// a process bootstrapper.

import 'dotenv/config'

// Fail fast if critical secrets are missing or malformed
for (const key of ['BETTER_AUTH_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL']) {
  if (!process.env[key]) {
    console.error(`[FATAL] Required env var ${key} is not set`)
    process.exit(1)
  }
}
if (Buffer.from(process.env.ENCRYPTION_KEY, 'hex').length !== 32) {
  console.error('[FATAL] ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  process.exit(1)
}

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import handler from './dist/server/server.js'

const port = process.env.PORT ? Number(process.env.PORT) : 3000
const app = new Hono()

function withSecurityHeaders(response, pathname) {
  // Transfer the body stream to a new Response with merged headers.
  // Passing a ReadableStream straight to the Response constructor works
  // because we don't touch the original afterwards — earlier attempts
  // to buffer via arrayBuffer() + rebuild inside a Hono middleware
  // ended up with the rebuilt response losing its content-type/body
  // for reasons we never pinned down; returning a freshly-wrapped
  // Response directly from the route handler sidesteps that entirely.
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // Bull-board's bundled UI loads its fonts from Google Fonts; relax the
  // CSP only for that path so the rest of the app keeps the tighter policy.
  const isBullBoard = pathname.startsWith('/api/admin/queues')
  const styleSrc = isBullBoard
    ? "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
    : "style-src 'self' 'unsafe-inline'"
  const fontSrc = isBullBoard
    ? "font-src 'self' https://fonts.gstatic.com"
    : "font-src 'self'"
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      styleSrc,
      "img-src 'self' data: blob: https:",
      fontSrc,
      "connect-src 'self' https:",
      "frame-src https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )
  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// Serve the Vite client bundle first (static assets like /assets/*.js + css).
app.use('/assets/*', serveStatic({ root: './dist/client' }))
app.use('/favicon.ico', serveStatic({ path: './dist/client/favicon.ico' }))

// Everything else goes to the TanStack Start fetch handler, with security
// headers applied on the way out.
app.all('*', async (c) => {
  const response = await handler.fetch(c.req.raw)
  return withSecurityHeaders(response, new URL(c.req.url).pathname)
})

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[start] listening on http://localhost:${info.port}`)
})
