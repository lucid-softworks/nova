## STAGE 43 — Bluesky post backfill

Import a connected Bluesky account's existing posts so they appear in
the Posts list and the analytics sync can pull engagement metrics for
them. Other platforms can follow the same pattern later.

### Why Bluesky first

- `app.bsky.feed.getAuthorFeed` returns the full post history with
  a cursor, no rate-limit tier required, no review process.
- Each post record includes `likeCount`, `repostCount`, `replyCount`
  at fetch time — we can seed the first analytics snapshot immediately.
- No view/impression count exists in the API (confirmed) — we skip
  that column cleanly.

### Scope

1. **Backfill server fn** — `backfillBlueskyImpl(workspaceSlug,
   socialAccountId, maxPages)`:
   - Fetches pages of `getAuthorFeed` (limit=50 per page, up to
     `maxPages` pages, default 5 = ~250 posts).
   - For each post where `post.author.did === account.did` (skip
     reposts of others):
     - Skip if `post_platforms` already has a row with this
       `platformPostId` for this account (dedup).
     - Create a `posts` row (status=published, publishedAt from
       `post.record.createdAt`, authorId from the feed creator).
     - Create a `post_versions` row with the text content.
     - Create a `post_platforms` row with the at-uri as
       `platformPostId` and the public URL as `publishedUrl`.
   - After all pages: trigger an immediate analytics sync for this
     account via `enqueueManualSync({ socialAccountId })`.
   - Return `{ imported, skipped, total }`.

2. **UI** — Accounts page gains a "Backfill" button per connected
   Bluesky account. Clicking shows a confirmation ("Import up to 250
   recent posts?"), then calls the server fn. Toast with the result.

3. **Analytics pickup** — the existing Bluesky analytics adapter
   already calls `getPosts` with the `platformPostIds` from
   `post_platforms`. Newly-backfilled rows just appear in its next
   pass. No adapter changes needed.

4. **Inbox linking** — the inbox poller's `resolvePostPlatformId`
   join already matches `post_platforms.platformPostId` against
   notification URIs. Backfilled posts will link up automatically on
   the next inbox poll.

### Out of scope

- Backfill for other platforms (each has a different feed API shape;
  stage the work per-platform once this pattern proves out).
- Historical analytics beyond the snapshot seeded at import time —
  Bluesky doesn't expose time-series engagement data, only current
  counts.
- Media import — we don't download and re-host images from existing
  posts; the `post_versions` row stores text only.

### Acceptance

- Connect a Bluesky account with 100+ existing posts → click
  Backfill → Posts list shows them as "published" with their original
  dates.
- Click "Sync" on the Analytics page → follower chart + per-post
  engagement numbers appear for the backfilled posts.
- Inbox replies to those posts link back via postPlatformId.
- Running Backfill twice doesn't duplicate posts.
