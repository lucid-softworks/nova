## STAGE 24 — Finish the real platform publishers

Stage 6 shipped Bluesky real + `PublishError` + variable substitution. The
other 11 platforms remain Stage-4-era stubs that pretend to publish. This
stage closes that out.

### Order of attack

Prioritise by the accounts our users actually have connected. At minimum:

1. **X** — OAuth2 PKCE; v2 tweets endpoint; chunked media upload via v1.1;
   thread support already modelled in our post_versions.threadParts
2. **LinkedIn** — `/v2/ugcPosts`; image asset register + upload; personal
   vs organization shares
3. **Mastodon** — simplest non-Bluesky; per-instance OAuth; statuses +
   media uploads. Also closes the Stage 2 Mastodon connect flow gap
   (app registration per instance)
4. **Facebook + Instagram** — Meta Graph API, page access tokens, IG
   container pattern
5. **Threads** — same container pattern as IG (Meta owned)
6. **Tumblr** — OAuth 1.0a signing; separate text / photo / video post
   types
7. **Reddit** — `/api/submit` + OAuth2; subreddit awareness
8. **TikTok** — chunked video upload via Content Posting API
9. **YouTube** — resumable upload via Data API v3
10. **Pinterest** — pins via v5

### Per-platform checklist

- Add provider config to `server/oauth/providers.server.ts` if not already
- Real publisher in `server/publishing/original/<p>.ts`:
  * Upload media (platform-specific)
  * Post (respecting content, first comment, thread mode where supported)
  * Return `{ platformPostId, url, publishedAt }`
  * Throw `PublishError` with correct code (`AUTH_EXPIRED`, `RATE_LIMITED`,
    `MEDIA_TOO_LARGE`, `INVALID_FORMAT`, `UNKNOWN`)
- Real reshare publisher in `server/publishing/reshare/<p>.ts` for the 7
  still-stubbed reshare platforms (X, Tumblr, FB, LinkedIn, Threads,
  Mastodon, Reddit)
- Mastodon: finish the instance registration / OAuth flow in Stage 2's
  connect modal

### Shared infra already in place

- `PublishError` class + retryable flag
- Campaign variable substitution in the worker
- Auth-expired handling: flips `social_accounts.status='expired'` and
  notifies the workspace
- Published URL persisted to `post_versions.platformVariables` so dependent
  campaign steps see it

### Acceptance

- Each platform has a live publish posting a real post via our account
- Each platform's `AUTH_EXPIRED` path correctly flips account status and
  surfaces a reconnect prompt in the accounts list
- Media mismatch detection in the composer matches what the real API
  actually rejects (tighten `lib/platforms.ts` mediaRequirements as we
  learn)
