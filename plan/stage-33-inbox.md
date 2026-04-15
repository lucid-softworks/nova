## STAGE 33 — Unified inbox (Bluesky + Mastodon)

First pass at an inbox view: mentions, replies, and DMs from the two
simplest platforms. Designed to extend to the rest once this shape is
proven.

### Why those two

- Bluesky's `app.bsky.notification.listNotifications` returns every
  interaction in one call with a cursor.
- Mastodon's `/api/v1/notifications` is the same story.
- Both are bearer-auth, no per-request HMAC, no review process.

Every other platform needs a significant per-platform investment (Meta's
webhook subscription dance, X's paid Premium tier for mentions, etc.)
and is better deferred until this surface earns its keep.

### Schema

```
inbox_items(
  id uuid,
  workspaceId uuid,
  socialAccountId uuid,
  platform text,              -- bluesky | mastodon (enum grows later)
  platformItemId text,        -- dedup key per account
  kind text,                  -- mention | reply | like | repost | follow | dm
  actorHandle text,
  actorName text,
  actorAvatar text,
  content text,
  permalink text,
  createdAt timestamp,
  readAt timestamp nullable,
  postPlatformId uuid nullable references post_platforms on delete set null
)
unique (socialAccountId, platformItemId)
```

### Poller

New BullMQ repeatable — every 5 min walks connected Bluesky + Mastodon
accounts, asks for notifications newer than the last stored
`platformItemId` for that account, upserts into `inbox_items`. Joins on
`post_platforms.platformPostId` so the UI can link replies/mentions back
to the original scheduled post.

### UI

`/inbox` route with tabs (All / Mentions / Replies / Likes), a read/unread
toggle, and actions: mark read, reply (pop the composer with `@handle`
pre-filled and threaded correctly), open on platform.

### Acceptance

- A Mastodon reply to a post published via the app shows up in the
  inbox within five minutes.
- Marking read persists; reloading keeps the state.
- Clicking "Reply" lands in the composer with the right account
  selected and the thread context set so the publisher threads
  correctly on publish.

### Out of scope

- DMs (Bluesky's DM API is in flux; Mastodon has direct-visibility
  statuses which conflate with mentions — revisit in a later stage).
- Other platforms.
