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

// Security headers — rebuild the response because TanStack Start returns
// a Response with frozen headers that cannot be mutated in place.
app.use('*', async (c, next) => {
  await next()
  const headers = new Headers(c.res.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
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
  c.res = new Response(c.res.body, {
    status: c.res.status,
    statusText: c.res.statusText,
    headers,
  })
})

// Serve the Vite client bundle first (static assets like /assets/*.js + css).
app.use('/assets/*', serveStatic({ root: './dist/client' }))
app.use('/favicon.ico', serveStatic({ path: './dist/client/favicon.ico' }))

// Everything else goes to the TanStack Start fetch handler.
app.all('*', (c) => handler.fetch(c.req.raw))

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[start] listening on http://localhost:${info.port}`)
})
