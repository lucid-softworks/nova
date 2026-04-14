## STAGE 9 — Reshare System

### Reshare Browser slide-over

Opened via:
- "New Post" dropdown → "Queue Reshares"
- "Queue Reshares" button in the Posts list top bar

**Header row**:
- Platform selector (dropdown, only reshare-supporting platforms):
  X, Tumblr, Facebook, LinkedIn, Threads, Bluesky, Mastodon, Reddit
- Mode toggle: "Browse Account" | "Search"
- Browse Account mode:
  - Handle input + "Load" button
  - Monitored accounts shortcut: dropdown of saved `monitored_accounts` for this platform
  - "Save to Monitored Accounts" checkbox (appears after loading results)
- Search mode:
  - Hashtag/keyword input + "Search" button
  - Reddit: also shows subreddit input

**Results area**:

Each result card:
- Author avatar + display name + handle
- Post content (truncated 3 lines, "Show more" expands)
- First media thumbnail if available
- Original post date + engagement stats (where API provides)
- Reshare controls:
  - X: radio "Retweet" / "Quote Tweet"
  - Tumblr: radio "Reblog" / "Reblog with comment"
  - Facebook: "Share" (always; optional message field)
  - LinkedIn: radio "Repost" / "Repost with comment"
  - Threads: "Repost" only (no quote)
  - Bluesky: radio "Repost" / "Quote Post"
  - Mastodon: radio "Boost" / "Quote"
  - Reddit: "Crosspost" — shows subreddit input (required)
- If quote/comment type selected: textarea for added commentary
  - Character limit shown for that platform
  - ✨ AI Assist button (opens AI panel with reshare context)
  - Character counter
- Checkbox (top-right of card) to select for bulk queuing

**Bulk actions bar** (appears when ≥1 selected):
- "Queue [N] posts" primary button
- Schedule mode toggle: "Add to Queue" | "Schedule" (date/time picker)
- Target account selector: which of the user's connected accounts to reshare from
- Confirm action:
  - Creates one `posts` record per selected item (`type: 'reshare'`)
  - Creates `post_reshare_details` record (snapshot of source content at this moment)
  - Creates `post_activity (reshared)`
  - Shows success toast: "[N] reshares added to queue"

**Platform API calls for browsing**:
- X: `GET /2/users/:id/tweets` (browse) · `GET /2/tweets/search/recent` (search)
- Tumblr: `GET /v2/blog/{blogId}/posts` (browse) · `GET /v2/tagged` (search)
- Facebook: `GET /{pageId}/posts` (browse only — no hashtag search; show note)
- LinkedIn: own content only via API; browsing others not available — show friendly note + "Paste URL" fallback
- Threads: limited public browsing — show note if unavailable
- Bluesky: `agent.getAuthorFeed()` (browse) · `agent.searchPosts()` (search)
- Mastodon: `GET /api/v1/accounts/:id/statuses` (browse) · `GET /api/v1/timelines/tag/:hashtag` (search)
- Reddit: `GET /r/{subreddit}/hot` or `/new` (browse) · `GET /r/{subreddit}/search` (search)

For platforms with limited API access, show a styled notice card explaining the limitation.

### Reshare publishing implementations (`server/publishing/reshare/`)

**X** (`reshare/x.ts`):
- Retweet: `POST /2/users/:id/retweets { tweet_id: sourcePostId }`
- Quote: `POST /2/tweets { text: quoteComment, quote_tweet_id: sourcePostId }`

**Tumblr** (`reshare/tumblr.ts`):
- `POST /v2/blog/{blogId}/posts` with `{ reblog: { comment, parent_tumblelog, parent_post_id } }`

**Facebook** (`reshare/facebook.ts`):
- `POST /{pageId}/feed { link: sourcePostUrl, message: quoteComment }`

**LinkedIn** (`reshare/linkedin.ts`):
- `POST /v2/shares` with `resharedShare` referencing source URN + optional commentary

**Threads** (`reshare/threads.ts`):
- Threads API repost endpoint

**Bluesky** (`reshare/bluesky.ts`):
- Repost: `agent.repost(uri, cid)`
- Quote: `agent.post({ text: quoteComment, embed: { $type: 'app.bsky.embed.record', record: { uri, cid } } })`

**Mastodon** (`reshare/mastodon.ts`):
- Boost: `POST {instanceUrl}/api/v1/statuses/:id/reblog`
- Quote: `POST {instanceUrl}/api/v1/statuses { status: quoteComment + "\n" + sourcePostUrl }`

**Reddit** (`reshare/reddit.ts`):
- `POST /api/crosspost { sr: targetSubreddit, url: sourcePostUrl, title }`
- If quoteComment set: `POST /api/comment { thing_id: newPostFullname, text: quoteComment }`

---

