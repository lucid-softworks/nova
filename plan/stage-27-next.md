## STAGE 27 — Proposed next scope (post-audit)

After Stages 20/24/25 landed, an audit surfaced the items below. They're
grouped so each group could ship independently; pick and mix.

### Group A — Video + media gaps (high user impact)

Six publishers still throw `NOT_IMPLEMENTED` for specific shapes:

| # | File:line | Reason |
|---|---|---|
| 1 | `app/server/publishing/original/instagram.ts:90` | Reels / video |
| 2 | `app/server/publishing/original/threads.ts:79` | Video |
| 3 | `app/server/publishing/original/facebook.ts:100` | Video |
| 4 | `app/server/publishing/original/reddit.ts:207` | Video submit |
| 5 | `app/server/publishing/reshare/threads.ts:6` | Platform doesn't expose reshare API |
| 6 | `app/server/publishing/reshare/x.ts:164` | Reshare types other than repost/quote |

Instagram Reels + Facebook video + Reddit video are the three that
actually unlock features users will hit. The Threads/X reshare items
should stay `NOT_IMPLEMENTED` until the platforms expose something.

### Group B — Observability

No Sentry / structured logging / queue dashboards. In prod you want:
- Sentry for `PublishError` + worker job failures
- `pino` with request-id / job-id correlation ids instead of `console.*`
- BullMQ dashboard mounted behind admin auth (bull-board is trivial)

### Group C — Testing

`grep -r '\.test\.'` returns nothing under `app/`. Critical things to
cover first:
- Publisher error mapping (401 → AUTH_EXPIRED, 429 → RATE_LIMITED, etc)
- Analytics adapters' JSON parsing (real response fixtures)
- `campaignWorker` dependency resolution (skip/trigger paths)
- OAuth state round-trip (PKCE + cookie integrity)

### Group D — Polish / UX

- Post search (`app/routes/_dashboard/$workspaceSlug/posts.tsx` has
  filters by status but no content search)
- Hashtag suggestion UI wired to existing AI assist
- Activity log surface (`post_activity` rows are written but there's
  no workspace-wide feed view)
- Dark mode (Tailwind ready; needs a toggle + palette audit)
- Link shortener + UTM builder inside the composer

### Group E — Monetisation scaffold (optional)

Nothing in the schema enforces plan limits. If that's on the roadmap:
- Stripe integration + `workspace_plan` table
- Seat limits (easy — `member` count check at invite time)
- Post/account quota (harder — needs middleware on publish enqueue)

### Not included (either done or out of scope)

- Better Auth already covers email verification, password reset, 2FA
- Stage 23 (production deploy) is still separately unbuilt — keep as
  its own stage, not part of 27

### Acceptance

- Pick Groups that ship together; each group is independently valuable
- Group A is the most user-visible; Group B is the most
  operationally urgent for prod; Group C is the safety net.
