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
  // RFC 8288 Link headers — advertise discoverable resources so crawling
  // agents + API clients can jump to the catalog, OpenAPI spec, and
  // sitemap without scraping the HTML. Multiple relations comma-joined.
  headers.set(
    'Link',
    [
      '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
      '</api/v1/openapi/json>; rel="service-desc"; type="application/json"',
      '</api/v1/openapi/json>; rel="describedby"; type="application/json"',
      '</sitemap.xml>; rel="sitemap"; type="application/xml"',
    ].join(', '),
  )
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// RFC 9727 API Catalog — served ahead of the TanStack handler because
// /.well-known/* paths aren't individual routes. Each entry describes
// one API: anchor is the API base URL, service-desc is the machine-
// readable OpenAPI spec, service-doc is human-readable documentation,
// and status is the health endpoint per RFC 9727 Appendix A.
const APP_BASE = (process.env.APP_URL ?? 'https://skeduleit.org').replace(/\/+$/, '')
const API_CATALOG = JSON.stringify({
  linkset: [
    {
      anchor: `${APP_BASE}/api/v1`,
      'service-desc': [
        {
          href: `${APP_BASE}/api/v1/openapi/json`,
          type: 'application/json',
        },
      ],
      'service-doc': [
        {
          href: `${APP_BASE}/api/v1/openapi/json`,
          type: 'application/json',
        },
      ],
      status: [
        {
          href: `${APP_BASE}/healthz`,
          type: 'application/json',
        },
      ],
    },
  ],
})

// Post-processing middleware: after whatever handler produced a
// response, wrap it with security + Link headers so static files, the
// api-catalog, and TanStack Start routes all ship the same set.
app.use('*', async (c, next) => {
  await next()
  if (c.res) {
    c.res = withSecurityHeaders(c.res, new URL(c.req.url).pathname)
  }
})

// Serve the Vite client bundle and every file under public/ (copied into
// dist/client at build time). serveStatic falls through to the next
// middleware on 404, so TanStack Start gets every dynamic route.
app.use('/assets/*', serveStatic({ root: './dist/client' }))
app.use('/favicon.ico', serveStatic({ path: './dist/client/favicon.ico' }))
app.use('/robots.txt', serveStatic({ path: './dist/client/robots.txt' }))
app.use('/manifest.webmanifest', serveStatic({ path: './dist/client/manifest.webmanifest' }))
app.use('/og-image.svg', serveStatic({ path: './dist/client/og-image.svg' }))
app.use('/sw.js', serveStatic({ path: './dist/client/sw.js' }))
app.use('/offline.html', serveStatic({ path: './dist/client/offline.html' }))
app.use('/icons/*', serveStatic({ root: './dist/client' }))

// RFC 9727 API catalog. Kept as a short JSON constant because the
// content is purely configuration — it can't reach the app's DB.
app.get('/.well-known/api-catalog', () => {
  return new Response(API_CATALOG, {
    headers: {
      'Content-Type': 'application/linkset+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

// Everything else goes to the TanStack Start fetch handler.
app.all('*', async (c) => handler.fetch(c.req.raw))

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[start] listening on http://localhost:${info.port}`)
})
