## STAGE 34 — Inbox, extended platform coverage

Stage 33 shipped the unified inbox for Bluesky + Mastodon — the two
platforms with clean account-level notification APIs. This stage
covers the rest of the connected platforms using whatever shape each
API actually exposes.

This plan was written after the work shipped — the commits existed
before the stage file, and this doc ratifies them.

### Shipped (`db1202f`)

| Platform | Source | Kind of signal |
|---|---|---|
| X | `/2/users/:id/mentions` | mentions + replies |
| Reddit | `/message/inbox` | mentions, replies, DMs |
| YouTube | `commentThreads` per published video | per-post replies |
| Tumblr | `/blog/:blog/notes?mode=all` per post | notes (like/reblog/reply) |
| Facebook | `/{postId}/comments` per page post | per-post replies |
| Instagram | `/{mediaId}/comments` per media | per-post replies |
| Threads | `/{threadId}/replies` per post | per-post replies |
| LinkedIn | `socialActions/:urn/comments` per share | per-post replies |

The six comment-based adapters need the account's recently-published
platform post ids to know what to poll. `InboxAccountCtx` grew a
`publishedPlatformPostIds` field, populated in `poll.ts` from a
top-50 query against `post_platforms` per account.

### Shipped (`997c57c`)

| Platform | Source | Kind of signal |
|---|---|---|
| TikTok (Business only) | `business-api.tiktok.com/open_api/v1.3/business/messages/list/` | direct messages |

Gated on `metadata.businessId` — personal TikTok accounts silently
return `[]`. Uses the `Access-Token` header (not a Bearer prefix).
Messages from the business account itself are filtered out so the
inbox only shows incoming conversations.

### Still missing

- **Pinterest** — no public notifications / comments-list API worth
  building against. Left out; revisit if Pinterest ships something.
- **LinkedIn likes / reshares** — the `socialActions` endpoint returns
  comments only. Reactions would need per-share reaction queries;
  skipped for now since comments are the highest-signal item.
- **X likes / retweets** — separate endpoints exist but require a
  higher API tier. Mentions were the minimum-viable inclusion.

### Acceptance

- Every connected platform that exposes any form of notification or
  reply data shows up in the unified inbox.
- Adapters degrade silently on missing metadata (no `businessId`, no
  `urn`, no published posts yet) rather than erroring.
- Single poll cycle handles all platforms from one BullMQ job.
