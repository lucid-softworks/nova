## STAGE 29 — RSS auto-post

Subscribe a feed URL; new items become drafts (or auto-scheduled posts
if the workspace opts in). Typical content-team workflow: blog RSS →
LinkedIn / X / Mastodon announcements.

### Scope

1. **Schema** — new `rss_feeds` and `rss_feed_items` tables:
   - `rss_feeds(id, workspaceId, url, title, lastPolledAt, autoPublish
     bool, defaultAccountIds uuid[], contentTemplate text, active bool,
     createdAt)`
   - `rss_feed_items(id, feedId, guid, link, publishedAt, postId nullable,
     createdAt)` — `(feedId, guid)` unique so we don't double-import.

2. **Poller** — BullMQ repeatable job every 15 min walks active feeds,
   parses the RSS/Atom XML, upserts items, creates draft posts for new
   ones using the feed's `contentTemplate` (supports `{{title}}`,
   `{{link}}`, `{{description}}`).

3. **UI** — `/settings/rss` lets the user add/remove feeds, toggle
   auto-publish, pick default accounts, and edit the template. A "Sync
   now" button triggers an ad-hoc poll for one feed.

### Acceptance

- Add a feed pointing at a known blog; within 15 minutes (or after
  clicking Sync now) three most recent posts appear as drafts in the
  Posts list.
- Re-polling doesn't create duplicates.
- If `autoPublish=true` and default accounts are set, items become
  scheduled posts at `now + 5 min` instead of drafts.
