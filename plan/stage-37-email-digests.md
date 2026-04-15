## STAGE 37 — Weekly email digests

Opt-in weekly summary mailed to each member of each workspace:
- posts published last week (count + platform breakdown)
- unread inbox count
- failed jobs / publish errors
- upcoming scheduled posts (next 7 days)

Runs on a BullMQ repeatable at Monday 09:00 UTC. Per-user opt-in
(default off) so we don't spam on day one.

### Schema

- `user.digestOptIn boolean default false not null` — Better Auth
  lets us extend the user table via additional columns.

### Pieces

1. **Digest builder** — `app/server/digests/build.ts`: for a
   `(workspaceId, userId)` pair, returns a typed summary object with
   the counts + top posts + inbox highlights.
2. **Mailer template** — reuse `sendEmail` (Resend or console).
   Plain-text + minimal HTML body. Include an "Unsubscribe" link that
   hits a signed token endpoint which flips `digestOptIn=false`.
3. **Queue + worker** — `digest` BullMQ queue, repeatable Monday
   09:00 UTC. Worker enumerates opted-in users × their workspaces,
   builds + sends in sequence (staggered 250ms so Resend doesn't
   rate-limit on big rollouts).
4. **Bootstrap wire-up** — both `queues/bootstrap.ts` and
   `worker.ts` boot the new queue + schedule.
5. **UI** — Settings → Notifications tab gets a "Weekly digest"
   toggle wired to a new server fn.

### Acceptance

- With `digestOptIn=true`, the repeatable job sends a single email
  per (user, workspace) with the sections above.
- Unsubscribe link flips the flag and returns a simple confirmation
  page; re-enabling takes effect on the next Monday.
- Opted-out users get nothing.
- Running the worker twice in the same minute doesn't send twice
  (repeatable dedupes on the job id).
