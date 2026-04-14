## STAGE 15 — Analytics

### Page: `/{workspaceSlug}/analytics`

**Top controls**:
- Time range segmented control: 7 days / 30 days / 90 days / Custom date range
- Account filter dropdown: All accounts / individual account

**Summary cards row**:
Total Posts · Total Reshares · Total Reach · Total Engagements · Avg Engagement Rate · Follower Growth
Each card: large metric value + delta vs previous period (green ↑ or red ↓ with percentage)

**Charts (Recharts)**:

Follower Growth (LineChart):
- X: dates · Y: follower count
- One line per connected account (color = platform brand color)
- Toggle lines via legend clicks
- Tooltip: exact count per account

Daily Engagements (BarChart):
- X: dates · Y: total engagements
- Stacked bars: Likes / Comments / Shares / Clicks
- Tooltip: breakdown per type

Engagement Breakdown (PieChart / RadialChart):
- Segments: Likes · Comments · Shares · Clicks
- Center label: total engagements
- Legend with counts + percentages

Best Posting Times (custom heatmap):
- 7 columns (Mon–Sun) × 24 rows (hours 0–23)
- Cell background intensity = average engagement for posts at that day/hour
- Hover tooltip: "Avg engagement: [N]"

**Per-Platform Table**:
Platform · Account · Posts · Reshares · Reach · Impressions · Likes · Comments · Shares · Clicks · Eng. Rate
- Sortable columns
- Expandable rows: click platform row → shows per-account breakdown

**Top Performing Posts** (top 5 by total engagements):
- Thumbnail · content preview · platform icons
- Engagement stat chips: 👍 N · 💬 N · 🔁 N · 🔗 N
- "View post" external link

**Campaigns tab**:
- List of all campaigns with combined metrics:
  Name · Status · Steps · Total Reach · Total Engagements · Eng. Rate · Date range
- Click row → expands to per-step breakdown
- "View Campaign" link → Campaign Detail page

**Analytics sync** (`server/queues/analyticsSync.ts`):
Daily BullMQ cron at 02:00 UTC. For each connected `social_account`:
- Call platform insights API
- Upsert `analytics_snapshots` record for today

Platform endpoints:
- Facebook: `GET /{pageId}/insights?metric=page_reach,page_engaged_users`
- Instagram: `GET /{igUserId}/insights?metric=reach,impressions,profile_views`
- X: `GET /2/users/:id/tweets` + individual tweet metrics via `tweet.fields=public_metrics`
- LinkedIn: `GET /v2/organizationalEntityShareStatistics`
- YouTube: `GET https://youtubeanalytics.googleapis.com/v2/reports`
- Pinterest: `GET /v5/user_account/analytics`
- Tumblr: `GET /v2/blog/{blogId}/posts` and aggregate post notes
- Reddit: `GET /api/v1/me` + submitted post karma
- Mastodon: account stats from `GET {instanceUrl}/api/v1/accounts/:id`
- Bluesky: `agent.getProfile()` for follower counts; individual post metrics from feed
- Threads: Threads API insights endpoint
- TikTok: `GET /v2/video/list/` with `fields=statistics`

---

