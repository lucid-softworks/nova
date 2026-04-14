## STAGE 23 — Production deploy

Ship a real deploy pipeline. Right now `pnpm dev` works cleanly; `pnpm
build` fails because the SSR bundle drags `postgres` + `node:perf_hooks`
into its graph.

### Blockers to unblock

1. **SSR build failure** — Vite tries to bundle `postgres` as if it were
   isomorphic. Two paths:
   - Add `postgres` (+ bullmq, ioredis, @anthropic-ai/sdk, sharp-once-it-
     lands) to `ssr.external` in `vite.config.ts`
   - Or mark each server-only module with the `.server.ts` suffix we
     already use in places and make sure nothing client imports them
2. **Split worker into its own process** — today the scheduler + BullMQ
   worker run inside the web process via `queues/bootstrap.ts`. For
   prod:
   - `pnpm worker` entry (`app/worker-entry.ts`) that imports and starts
     `postQueue` + `worker.ts` + `scheduler.ts` standalone
   - `bootstrap.ts` becomes a no-op when `process.env.DISABLE_INLINE_WORKER=1`
   - `docker-compose.prod.yml` / fly.toml / whatever we pick runs web +
     worker + postgres + redis as separate services
3. **Env matrix** — lock down which envs are required for prod and which
   are optional (dev only). Extend `.env.example` with `# required` /
   `# optional (dev only)` comments per group.
4. **Secrets rotation** — document how to rotate `ENCRYPTION_KEY` (it
   encrypts OAuth + brrr.now secrets; rotation means re-encrypting every
   row under the new key). Write a one-off migration helper.

### Deployment target

Pick one (open question):
- Fly.io (fits the Node + worker + Redis + Postgres model cleanly)
- Railway (one-click Postgres + Redis, decent for a small team)
- AWS ECS + RDS + ElastiCache (if we expect growth)

### Acceptance

- `pnpm build && pnpm start` runs locally against the prod bundle with
  zero warnings
- Worker process runs standalone; killing the web process doesn't stop
  scheduled posts
- CI pipeline runs typecheck + lint + build on every PR
- A smoke test hits `/login`, `/api/v1/posts`, and the Better Auth
  `/sign-in/email` endpoint in staging after each deploy
