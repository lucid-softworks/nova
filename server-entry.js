// Thin Node adapter: takes the fetch-style handler TanStack Start emits at
// dist/server/server.js and binds it to @hono/node-server so `pnpm start`
// actually listens on a port.
//
// We keep this tiny and JS (not TS) so it doesn't need compiling; it's just
// a process bootstrapper.

import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import handler from './dist/server/server.js'

const port = process.env.PORT ? Number(process.env.PORT) : 3000
const app = new Hono()

// Serve the Vite client bundle first (static assets like /assets/*.js + css).
app.use('/assets/*', serveStatic({ root: './dist/client' }))
app.use('/favicon.ico', serveStatic({ path: './dist/client/favicon.ico' }))

// Everything else goes to the TanStack Start fetch handler.
app.all('*', (c) => handler.fetch(c.req.raw))

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[start] listening on http://localhost:${info.port}`)
})
