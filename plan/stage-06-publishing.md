## STAGE 6 — Platform Publishing (Original Posts — Real Implementations)

Replace all original post stubs with real API calls. Implement one at a time.
Each publisher must handle: text content, variable substitution, media upload,
first comment, thread mode where supported.

**Interface**:
```ts
interface PublishResult {
  platformPostId: string
  url?: string
  publishedAt: Date
}

interface PublishError extends Error {
  code: string          // machine-readable, e.g. 'RATE_LIMITED', 'AUTH_EXPIRED'
  userMessage: string   // shown in UI
  retryable: boolean
}
```

**Implementations** (implement in this order):

**X** (`original/x.ts`):
- Media: upload via v1.1 `/media/upload` (chunked for video > 5MB)
- Post: `POST /2/tweets` with `{ text, media: { media_ids } }`
- Thread: create first tweet, each subsequent tweet sets `reply.in_reply_to_tweet_id`
- First comment: reply to the created tweet
- Returns tweet URL: `https://x.com/{handle}/status/{id}`

**Facebook** (`original/facebook.ts`):
- Use page access token from `social_accounts.metadata.pageAccessToken`
- Images: `POST /{pageId}/photos?published=false` per image → get `media_fbid`
- Post: `POST /{pageId}/feed` with `{ message, attached_media: [{ media_fbid }] }`
- First comment: `POST /{postId}/comments`

**Instagram** (`original/instagram.ts`):
- Single image: create container → `POST /{igUserId}/media_publish`
- Carousel: create item containers → carousel container → publish
- Reels: upload video → create reel container → publish
- First comment: `POST /{mediaId}/comments`

**LinkedIn** (`original/linkedin.ts`):
- Upload images via assets API: `POST /v2/assets?action=registerUpload`
- Create post: `POST /v2/ugcPosts`
- First comment: `POST /v2/socialActions/{postUrn}/comments`

**Tumblr** (`original/tumblr.ts`):
- OAuth 1.0a signing on every request
- Text post: `POST /v2/blog/{blogId}/posts` with `{ type: 'text', body }`
- Photo post: upload images, `{ type: 'photo', data64: [...] }`
- Video post: `{ type: 'video', data64 }` or `{ embed }` for URL
- Thread/trail: use `trail` array

**Reddit** (`original/reddit.ts`):
- Text post: `POST /api/submit` with `{ kind: 'self', sr, title, text }`
- Link post: `{ kind: 'link', url }`
- Image: upload to Reddit image hosting first, then link post
- Returns post URL from response `data.url`

**Bluesky** (`original/bluesky.ts`):
- Use `@atproto/api` package
- Authenticate: `agent.login({ identifier, password })`
- Upload images as blobs: `agent.uploadBlob(imageBuffer, { encoding: 'image/jpeg' })`
- Post: `agent.post({ text, embed: { $type: 'app.bsky.embed.images', images: [...] } })`
- Thread: each part replies to previous via `reply: { root, parent }`
- URL: `https://bsky.app/profile/{did}/post/{rkey}`

**Mastodon** (`original/mastodon.ts`):
- Instance URL from `social_accounts.metadata.instanceUrl`
- Upload: `POST {instanceUrl}/api/v2/media`
- Post: `POST {instanceUrl}/api/v1/statuses` with `{ status, media_ids }`
- Thread: each part sets `in_reply_to_id`

**Threads** (`original/threads.ts`):
- Same container pattern as Instagram (Meta Threads API)
- `POST /{userId}/threads` (create container) → `POST /{userId}/threads_publish`

**TikTok** (`original/tiktok.ts`):
- Video only (no image posts)
- Chunked video upload via Content Posting API
- `POST /v2/post/publish/video/init` → upload chunks → `POST /v2/post/publish/video/complete`

**YouTube** (`original/youtube.ts`):
- Resumable upload via Data API v3
- Title = first line of content (or first 100 chars)
- Description = full content
- `POST https://www.googleapis.com/upload/youtube/v3/videos`

**Pinterest** (`original/pinterest.ts`):
- Fetch user's boards: `GET /v5/boards`
- Create pin: `POST /v5/pins` with `{ board_id, media_source, title, description }`

**Error handling for all**:
- `RATE_LIMITED`: set `retryable: true`, add exponential delay before retry
- `AUTH_EXPIRED`: set `retryable: false`, set account `status = 'expired'`, create notification
- `MEDIA_TOO_LARGE` / `INVALID_FORMAT`: set `retryable: false`, user-friendly message
- Unknown errors: set `retryable: true` for first 2 retries, then `false`

---

