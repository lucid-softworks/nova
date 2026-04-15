# Deployment

Two deploy targets are wired up: **Docker Compose** (self-host on a VPS
or anywhere with a Docker engine) and **Fly.io** (two-app model with an
external managed Postgres + Redis). Pick whichever matches your infra.

## Architecture

Three process types, three containers/Fly-machines:

| Process | Scales | What it does |
|---|---|---|
| `web` | horizontally | TanStack Start SSR + API; `DISABLE_INLINE_WORKER=1` so it never touches queues |
| `worker` | horizontally | BullMQ workers + cron scheduler + analytics sync. Safe to run many replicas — Redis coordinates. |
| `postgres` / `redis` | managed externally in prod | State |

R2 / S3 is a hard dependency for media — local disk storage has been
removed. See the storage env vars in `.env.example`.

## Required environment

Group | Keys
---|---
Core | `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, `ENCRYPTION_KEY`
Storage (required) | `AWS_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT` (R2/MinIO), `STORAGE_PUBLIC_BASE_URL`
Mail | `RESEND_API_KEY`, `RESEND_FROM`
Platform OAuth | one set per platform you're enabling (see `.env.example`)
AI | `ANTHROPIC_API_KEY` (optional)
Billing | `BILLING_PROVIDER` + the selected provider's keys (optional)
Observability | `SENTRY_DSN`, `LOG_LEVEL` (optional)

Every worker replica must share the same `ENCRYPTION_KEY` as web — the
whole point of the key is that one process encrypts tokens and another
later decrypts them.

## Docker Compose (self-host)

```sh
cp .env.example .env
# Fill in every required var

docker compose -f docker-compose.prod.yml up -d --build

# First-time migrations + seed
docker compose -f docker-compose.prod.yml exec web pnpm db:push --force

# Scale workers
docker compose -f docker-compose.prod.yml up -d --scale worker=3
```

`web` exposes port 3000 with a `/healthz` check. Put an HTTPS reverse
proxy (Caddy / Traefik / nginx) in front of it.

## Fly.io

Two apps share the same Docker image. The worker never exposes HTTP and
scales independently.

```sh
# Web
fly launch --name nova-web --no-deploy
fly secrets set DATABASE_URL=... REDIS_URL=... BETTER_AUTH_SECRET=... \
  BETTER_AUTH_URL=https://nova-web.fly.dev APP_URL=https://nova-web.fly.dev \
  ENCRYPTION_KEY=<32-byte hex> \
  AWS_BUCKET=... AWS_REGION=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
  S3_ENDPOINT=https://<acct>.r2.cloudflarestorage.com \
  STORAGE_PUBLIC_BASE_URL=https://cdn.yourdomain.com
fly deploy

# Worker (share the image; different config file)
fly launch --name nova-worker --no-deploy --copy-config --config fly.worker.toml
# Copy the same secrets to the worker app (everything EXCEPT the inline-worker override).
fly secrets set --config fly.worker.toml DATABASE_URL=... REDIS_URL=... ENCRYPTION_KEY=... \
  AWS_BUCKET=... AWS_REGION=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
  S3_ENDPOINT=... STORAGE_PUBLIC_BASE_URL=...
fly deploy --config fly.worker.toml

# Scale workers horizontally whenever queues back up
fly scale count 3 --config fly.worker.toml
```

Postgres + Redis: `fly pg create`, `fly redis create` (or provision
Upstash / Neon and paste the connection strings into the secrets above).

## Migrations

```sh
# Against any environment where DATABASE_URL is set
pnpm db:push --force
```

Schema is source of truth; drizzle-kit compares against the live DB and
applies the diff. For production we always run this from a one-off
`fly ssh console --app nova-web -C "pnpm db:push --force"` (or its
compose equivalent) so it never races with a deploy.

## Secrets rotation

### `ENCRYPTION_KEY`

1. Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. In the worker (or any machine with DB access) run:
   ```sh
   OLD_ENCRYPTION_KEY=<current> NEW_ENCRYPTION_KEY=<new> \
     pnpm tsx app/scripts/rotate-encryption-key.ts
   ```
   Idempotent — safe to re-run. Rows already under the new key are
   skipped; partial failures are recoverable by re-running with the
   same keys.
3. Update `ENCRYPTION_KEY` on both the web and worker services to the
   new value, redeploy.
4. Keep the old key somewhere safe for a week in case you need to roll
   back before any new writes have happened under the new key.

### `BETTER_AUTH_SECRET`

Rotating this invalidates every signed cookie — all users will need to
sign in again. Schedule a maintenance window, rotate, redeploy both
services at once.

### Database credentials

Standard practice: create a new DB user with the same privileges, flip
`DATABASE_URL` on both services, redeploy, then revoke the old user.

## Smoke test after deploy

```sh
curl -fsS https://nova-web.example.com/healthz
# → {"ok":true,"checks":{"db":"ok","redis":"ok"}}

# Better Auth responds
curl -fsS https://nova-web.example.com/api/auth/session

# API v1 rate-limit + auth shape
curl -fsS https://nova-web.example.com/api/v1/openapi/json | head -c 200
```

## Observability

- Structured logs via pino at `LOG_LEVEL` (defaults `info` in prod).
- Sentry picks up worker + publish errors when `SENTRY_DSN` is set.
- `/admin/jobs` shows both queues' depths and the most recent failed
  jobs with a one-click retry — gated by platform-admin role.

## CI

`.github/workflows/ci.yml` runs typecheck + lint + test + build on every
PR and push to `main`. Add a deploy step only once a release branching
strategy is in place.
