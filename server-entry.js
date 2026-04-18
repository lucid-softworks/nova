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
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import handler from './dist/server/server.js'

const port = process.env.PORT ? Number(process.env.PORT) : 3000
const app = new Hono()

function withSecurityHeaders(body, originalHeaders, status, pathname) {
  // Build the final response in one pass: our security + Link headers
  // layered onto the downstream handler's Content-Type / Cache-Control,
  // with the body as a plain ArrayBuffer so we never pass a consumed
  // stream to the Response constructor.
  const headers = new Headers(originalHeaders)
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
  return new Response(body, { status, headers })
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

// Static assets from dist/client. serveStatic falls through on 404 so
// TanStack routes still match. These ship without our security/Link
// headers — serveStatic's own Content-Type + Cache-Control are what the
// platform needs for these files to actually work (nosniff etc. break
// og-image.svg delivery to social scrapers if we layered headers on
// top incorrectly).
app.use('/assets/*', serveStatic({ root: './dist/client' }))
app.use('/favicon.ico', serveStatic({ path: './dist/client/favicon.ico' }))
app.use('/robots.txt', serveStatic({ path: './dist/client/robots.txt' }))
app.use('/manifest.webmanifest', serveStatic({ path: './dist/client/manifest.webmanifest' }))
app.use('/og-image.svg', serveStatic({ path: './dist/client/og-image.svg' }))
app.use('/sw.js', serveStatic({ path: './dist/client/sw.js' }))
app.use('/offline.html', serveStatic({ path: './dist/client/offline.html' }))
app.use('/icons/*', serveStatic({ root: './dist/client' }))
app.use(
  '/.well-known/mcp/server-card.json',
  serveStatic({ path: './dist/client/.well-known/mcp/server-card.json' }),
)
app.use(
  '/.well-known/agent-skills/rest-api/SKILL.md',
  serveStatic({ path: './dist/client/.well-known/agent-skills/rest-api/SKILL.md' }),
)
app.use(
  '/.well-known/agent-skills/mcp/SKILL.md',
  serveStatic({ path: './dist/client/.well-known/agent-skills/mcp/SKILL.md' }),
)

// Agent Skills Discovery RFC v0.2.0 — the index lists every skill with
// a SHA-256 digest of its artefact. We compute digests from the on-disk
// SKILL.md files on each request and cache the result for an hour.
const AGENT_SKILLS = [
  {
    name: 'nova-rest-api',
    description: 'Read and schedule social media posts in Nova via the v1 REST API.',
    path: './dist/client/.well-known/agent-skills/rest-api/SKILL.md',
    url: '/.well-known/agent-skills/rest-api/SKILL.md',
  },
  {
    name: 'nova-mcp',
    description: "Connect to Nova's Model Context Protocol (MCP) server.",
    path: './dist/client/.well-known/agent-skills/mcp/SKILL.md',
    url: '/.well-known/agent-skills/mcp/SKILL.md',
  },
]

let agentSkillsCache = { builtAt: 0, body: null }
const AGENT_SKILLS_TTL_MS = 60 * 60 * 1000

async function buildAgentSkillsIndex() {
  if (agentSkillsCache.body && Date.now() - agentSkillsCache.builtAt < AGENT_SKILLS_TTL_MS) {
    return agentSkillsCache.body
  }
  const skills = []
  for (const s of AGENT_SKILLS) {
    try {
      const buf = await readFile(s.path)
      const digest = 'sha256:' + createHash('sha256').update(buf).digest('hex')
      skills.push({
        name: s.name,
        type: 'skill-md',
        description: s.description,
        url: s.url,
        digest,
      })
    } catch {
      // skip skills whose SKILL.md isn't present on disk
    }
  }
  const body = JSON.stringify(
    {
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
      skills,
    },
    null,
    2,
  )
  agentSkillsCache = { builtAt: Date.now(), body }
  return body
}

app.get('/.well-known/agent-skills/index.json', async () => {
  const body = await buildAgentSkillsIndex()
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

// RFC 9727 API catalog — small enough to construct inline.
app.get('/.well-known/api-catalog', () => {
  return new Response(API_CATALOG, {
    headers: {
      'Content-Type': 'application/linkset+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

// Everything else falls through to the TanStack Start fetch handler.
// Materialise the body once, then hand withSecurityHeaders the buffer
// directly — two Response(stream, ...) rebuilds in series drain the
// stream between them, which is how /healthz + /mcp ended up sending
// 0-byte responses even though the handler returned a populated body.
app.all('*', async (c) => {
  const pathname = new URL(c.req.url).pathname
  const response = await handler.fetch(c.req.raw)
  const buffer = await response.arrayBuffer()
  return withSecurityHeaders(buffer, response.headers, response.status, pathname)
})

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[start] listening on http://localhost:${info.port}`)
})
