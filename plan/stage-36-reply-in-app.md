## STAGE 36 — Reply in-app from inbox

Stage 33/34 added the unified inbox. Today the only action on an
inbox item is "open on platform". This stage lets the user draft and
publish a reply inside the app, threaded correctly where the platform
supports it.

### Scope

1. **Composer search params** — extend `ComposeSearch`:
   - `replyTo` (string) — platform-side id of the item we're replying
     to (tweet id, Mastodon status id, Bluesky at-uri, Threads id).
   - `replyHandle` (string) — actor handle for the `@` prefix.
   - `replyAccountId` (uuid) — `socialAccounts.id` for the account
     that received the mention. Pre-selects that account.
   - When present the composer initial state:
     - seeds `content` with `@replyHandle ` (with a leading space so the
       cursor sits after it, easy to continue typing).
     - seeds `socialAccountIds` with `[replyAccountId]`.
     - sets `platformVariables.replyToPostId` on the default version so
       the publisher can pass it to the platform's reply field.

2. **Inbox row — Reply button**:
   - For items where `platform ∈ {bluesky, mastodon, x, threads}` and
     `kind ∈ {mention, reply}`: button navigates to the composer with
     the search params above.
   - For every other platform/kind (comment-based or DM): the existing
     external "Open" link is the reply path — leave unchanged.

3. **Publisher threading** — four publishers read
   `ctx.version.platformVariables.replyToPostId` and pass it as the
   platform's native reply field:
   - **Bluesky**: `reply: { root: {uri,cid}, parent: {uri,cid} }`. For
     single-level replies, root === parent. The `replyToPostId` is the
     at-uri; we need its `cid` too — fetch via `com.atproto.repo.getRecord`.
   - **Mastodon**: `in_reply_to_id`.
   - **X**: `reply: { in_reply_to_tweet_id }`.
   - **Threads**: `reply_to_id` on the container create.

   Reddit reply-to-comment (`/api/comment` with `parent: t1_...`) is
   out of scope for this stage — comment replies are structurally
   different from our `posts` schema and deserve their own pass.

### Acceptance

- Click Reply on a Mastodon mention in the inbox → composer opens
  with `@handle `, the Mastodon account selected, status-id stashed.
  Publishing creates a reply that appears threaded in the Mastodon UI.
- Same for Bluesky, X, Threads.
- For platforms outside the four, the Reply button never renders; the
  existing "Open" link handles the flow.

### Out of scope

- Reply-to-comment on FB/IG/LinkedIn/YouTube/Tumblr — requires a new
  "comment reply" post type; revisit in a dedicated stage.
- DMs (TikTok Business) — sending DMs is different from replying to a
  status; also a separate concern.
- Quote / repost shortcuts — already handled by the existing reshare
  flow.
