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
  // Merge our headers onto the downstream response. Keeps Content-Type,
  // Content-Length, and any other headers the handler set; then layers
  // security + Link headers on top.
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
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

// Post-middleware that wraps every response with security + Link
// headers. Static files, the api-catalog, and TanStack Start routes all
// go through the same withSecurityHeaders() so the header set is
// uniform. Rebuilding the Response in-place — new Response(body, ...)
// — preserves the body stream; the earlier attempt to do this via
// c.res = new Response(...) inside a middleware *did* drain it, but
// doing it in the TERMINAL handler works because Hono hasn't started
// serializing yet.
async function wrap(c, get) {
  const response = await get()
  return withSecurityHeaders(response, new URL(c.req.url).pathname)
}

function staticRoute(path, options) {
  app.use(path, async (c, next) => {
    // serveStatic writes into c.res when it finds a file; otherwise calls
    // next(). We rebuild c.res afterwards so our headers land on the
    // static file response too.
    await serveStatic(options)(c, next)
    if (c.res) c.res = withSecurityHeaders(c.res, new URL(c.req.url).pathname)
  })
}

staticRoute('/assets/*', { root: './dist/client' })
staticRoute('/favicon.ico', { path: './dist/client/favicon.ico' })
staticRoute('/robots.txt', { path: './dist/client/robots.txt' })
staticRoute('/manifest.webmanifest', { path: './dist/client/manifest.webmanifest' })
staticRoute('/og-image.svg', { path: './dist/client/og-image.svg' })
staticRoute('/sw.js', { path: './dist/client/sw.js' })
staticRoute('/offline.html', { path: './dist/client/offline.html' })
staticRoute('/icons/*', { root: './dist/client' })
staticRoute('/.well-known/mcp/server-card.json', {
  path: './dist/client/.well-known/mcp/server-card.json',
})

// RFC 9727 API catalog.
app.get('/.well-known/api-catalog', (c) =>
  wrap(
    c,
    async () =>
      new Response(API_CATALOG, {
        headers: {
          'Content-Type': 'application/linkset+json; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      }),
  ),
)

// Everything else falls through to the TanStack Start fetch handler.
app.all('*', (c) => wrap(c, () => handler.fetch(c.req.raw)))

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[start] listening on http://localhost:${info.port}`)
})
