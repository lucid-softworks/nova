# Nova

Multi-platform social media management — planning, scheduling, publishing, and measuring posts across every network from one place. Live at [skeduleit.org](https://skeduleit.org).

## What's in the box

- **Multi-platform composer** for X, Bluesky, Mastodon, LinkedIn, Instagram, Threads, Facebook, YouTube Shorts, Pinterest, TikTok, Reddit, Tumblr — with per-platform character counts, media rules, and previews.
- **AI assist (BYOK)** — draft generation, tone rewrites, hashtag suggestions. Plug in your own Anthropic, OpenAI, Google, OpenRouter, MiniMax, Groq, DeepSeek, or any OpenAI-compatible endpoint. Nova never resells tokens.
- **Calendar** with month / week / agenda views + drag-to-reschedule.
- **Approvals & teams** — require approval before publish, invite editors, full per-post activity timeline with @mentions.
- **Analytics** — per-platform dashboards, per-post engagement, best-time-to-post heatmaps, CSV export.
- **Bio pages** (link-in-bio) hosted at `/bio/<handle>` with a picker of themes.
- **RSS auto-posting**, **multi-step campaigns**, **saved replies**, **monitors** (keyword tracking), **unified inbox**.
- **REST API + webhooks** for everything the UI does.
- **Billing** across Stripe, Polar, Dodo, Autumn, Creem, Chargebee. Live pricing pulled from the provider for the marketing page.

## Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (SSR React, file-based routing, server functions)
- **Database**: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/)
- **Queues**: [BullMQ](https://docs.bullmq.io/) on Redis — publishing, analytics sync, RSS polling, digest emails, monitors
- **Auth**: [Better Auth](https://better-auth.com/) with email+password, magic link, OTP, 2FA, passkeys, and org/admin plugins
- **UI**: Tailwind v4, Radix primitives, sonner toasts
- **AI**: Vercel [`ai`](https://ai-sdk.dev/) SDK
- **Package manager**: pnpm

## Prerequisites

- Node 22+
- pnpm 10.12+ (`npm i -g pnpm`)
- Postgres 15+ (local or managed)
- Redis 7+ (local or managed)
- An S3-compatible object store for media (R2, S3, MinIO) — local disk is not supported

## Quick start (dev)

```sh
cp .env.example .env
# Fill in DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET, ENCRYPTION_KEY,
# and any platform OAuth keys you want to test.

pnpm install
pnpm db:push         # apply the Drizzle schema to your local Postgres
pnpm dev             # web on http://localhost:4000
```

In another terminal:

```sh
pnpm worker          # BullMQ workers + cron scheduler
```

Both processes share the same `.env`. The **encryption key must be 64 hex chars** (32 bytes). Generate with `openssl rand -hex 32`.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Vite dev server for the web app |
| `pnpm worker` | Run queues + scheduler in a separate process |
| `pnpm build` | Production bundle |
| `pnpm start` | Serve the production bundle (node + hono) |
| `pnpm typecheck` | `tsc --noEmit` across the project |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm test` / `pnpm test:watch` | Vitest |
| `pnpm db:push` | Apply schema directly (dev) |
| `pnpm db:generate` | Emit SQL migrations |
| `pnpm db:migrate` | Apply generated migrations |
| `pnpm db:seed` | Seed sample data (dev only — guards against prod env) |

## Project layout

```
app/
  routes/              TanStack Start file-based routes (UI + API)
  components/          Shared React components, composer, calendar, media
  server/              Server-only modules (db, auth, queues, publishing)
    db/schema.ts       Drizzle schema (single source of truth)
    publishing/        Per-platform publish adapters
    queues/            BullMQ workers + job definitions
  lib/                 Isomorphic helpers (i18n, utils, logger, ai providers)
  worker.ts            Worker entry — runs every BullMQ processor
public/                Static assets served at root
server-entry.js        Production node/hono entry; applies security headers
drizzle.config.ts      Drizzle config
```

Server code lives in `*.server.ts` files or `app/server/`. The TanStack Start Vite plugin tree-shakes server modules out of the client bundle — don't import from `app/server/*` in client components, import from the matching `app/server/<name>.ts` which re-exports only the server-fn wrappers.

## Deploying to production

See [DEPLOY.md](./DEPLOY.md) for the full production setup — Docker Compose for self-host, Fly.io for managed. Currently production runs on Railway with the same architecture.

## License

Source-available — see [LICENSE](./LICENSE) if present. Reach out before using commercially.
