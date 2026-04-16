## STAGE 55 — Optimal posting time suggestions

Analyse the workspace's own historical engagement data and suggest
the best times to schedule. Uses the existing `analytics_snapshots` +
`post_metrics_snapshots` + `post_platforms.publishedAt` data — no
external API needed.

### Scope

1. **Server fn** — `getOptimalTimes(slug, accountId?)`:
   - Query published posts with engagement metrics in the last 90 days.
   - Bucket by (dayOfWeek, hour) → average engagement per bucket.
   - Return top 5 slots sorted by avg engagement, plus the full
     heatmap for display.
2. **UI** — composer gains a "Best time" chip next to the schedule
   picker. Clicking shows the top 5 slots; selecting one fills the
   schedule datetime.
3. **Analytics page** — the existing Best Posting Times heatmap
   already exists; ensure it now reflects real engagement (Stage 25
   wired this) and add a "Suggested" badge on the top slots.

### Acceptance

- Workspace with 50+ published posts → "Best time" in the composer
  shows 5 slots ranked by real engagement.
- Clicking a suggestion pre-fills the schedule datetime.
