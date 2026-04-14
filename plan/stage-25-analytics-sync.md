## STAGE 25 — Real analytics sync

Stage 15 built the UI and the query layer over `analytics_snapshots`, but
no rows are being written. `queues/analyticsSync.ts` is a stub.

### Scope

1. Daily BullMQ repeatable job at 02:00 UTC
2. For each connected `social_account`, call the relevant insights API
   and upsert a row keyed by `(socialAccountId, date)`
3. Track per-post metrics too — new `post_metrics_snapshots` table keyed
   by `(postPlatformId, date)` so we can back the Heatmap + Top Posts
   cards with real engagement numbers instead of post-count proxy

### Per-platform sync (pairs with Stage 24's publisher order)

| Platform | Call | Fields |
|---|---|---|
| Bluesky | `app.bsky.actor.getProfile` + feed getPosts | followers, likes, reposts, replies |
| X | `/2/users/:id/tweets?tweet.fields=public_metrics` | impressions, likes, retweets, replies |
| LinkedIn | `/v2/organizationalEntityShareStatistics` | impressions, clicks, engagements |
| FB | `/{pageId}/insights?metric=page_reach,page_engaged_users` | reach, engagements |
| IG | `/{igUserId}/insights?metric=reach,impressions,profile_views` | reach, impressions |
| Threads | threads insights | reach, likes |
| Mastodon | account stats from `/api/v1/accounts/:id` | followers |
| Tumblr | aggregate post notes | notes |
| Reddit | `/api/v1/me` + per-post karma | karma |
| TikTok | `/v2/video/list/` with `statistics` | views, likes, shares |
| YouTube | youtubeanalytics.googleapis.com reports | views, watch time, subs |
| Pinterest | `/v5/user_account/analytics` | impressions, clicks |

### Acceptance

- Analytics page shows populated Follower Growth, Daily Engagements, and
  Best Posting Times heatmap after at least one sync run
- Top Performing Posts lists real engagements (not post counts) and
  picks genuinely top posts within the range
- Sync is idempotent: running twice on the same day updates the row
  instead of duplicating it

### Watch-outs

- Rate limits per platform — don't parallel-blast all accounts; stagger
- Long-lived tokens vs short ones — if `AUTH_EXPIRED` comes back from
  insights, mark the account expired (same path as publishers)
- Some APIs only return insights for posts you published through them;
  join `post_platforms.platformPostId` with the insights response
