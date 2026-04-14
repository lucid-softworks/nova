# SocialHub — Full Build Plan
> Hand this file to Claude Code and say: "Implement Stage 1 of this plan, then stop and check in."

---

## IMPORTANT: HOW TO WORK

- Implement **one stage at a time**. After completing a stage, stop and summarise what was built and what comes next. Do not proceed to the next stage without being asked.
- Always run `pnpm typecheck` and `pnpm lint` before declaring a stage done.
- If you encounter an ambiguity not covered in this document, make a reasonable decision, implement it, and flag it in your check-in summary.
- Commit after each stage with the message: `feat: stage N — [stage name]`
- Never install a package without mentioning it. If there are multiple good options for something not specified, pick the most widely adopted one and flag it.
- Create a `.env.example` in Stage 1 and keep it up to date as new variables are introduced.
- All code is TypeScript. No `any` types. Zod schemas for all inputs and outputs.
- Package manager: **pnpm**

---

## TECH STACK

| Concern | Choice |
|---|---|
| Framework | TanStack Start (file-based routing, SSR, server functions) |
| Auth | Better Auth (email/password + Google + GitHub app login; genericOAuth for social platforms) |
| Database | PostgreSQL via Drizzle ORM |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui — New York style |
| Icons | Lucide React |
| Charts | Recharts |
| Queue / Jobs | BullMQ + Redis |
| File Storage | Local filesystem (dev) · S3-compatible (prod) |
| AI | Vercel AI SDK + Anthropic (`claude-sonnet-4-20250514`) |
| Validation | Zod (shared client + server) |
| Server state | TanStack Query |
| UI state | Zustand |
| Forms | React Hook Form + Zod resolver |

---

## PLATFORMS (12)

| Key | Label | Text Limit | Resharing |
|---|---|---|---|
| `facebook` | Facebook | 63,206 | Share post |
| `instagram` | Instagram | 2,200 | — |
| `threads` | Threads | 500 | Repost |
| `x` | X (Twitter) | 280 | Retweet + Quote Tweet |
| `linkedin` | LinkedIn | 3,000 | Repost + Quote |
| `youtube` | YouTube | 5,000 | — |
| `tiktok` | TikTok | 2,200 | — |
| `pinterest` | Pinterest | 500 | — |
| `mastodon` | Mastodon | 500 | Boost + Quote |
| `bluesky` | Bluesky | 300 | Repost + Quote |
| `tumblr` | Tumblr | 4,096 | Reblog |
| `reddit` | Reddit | 40,000 | Crosspost |

Define all platform metadata in `lib/platforms.ts`. Each entry contains:

```ts
{
  key: PlatformKey,
  label: string,
  color: string,           // hex brand color
  textLimit: number,
  supportsFirstComment: boolean,
  supportsThreads: boolean,
  supportsReels: boolean,
  supportsReshare: boolean,
  reshareTypes: ('repost' | 'quote' | 'reblog' | 'boost' | 'crosspost' | 'share')[],
  supportsHashtagSearch: boolean,
  supportsUrlVariable: boolean,  // does platform return a public URL after publish?
  urlVariableName: string | null, // e.g. 'youtube_url'
  oauthScopes: string[],
  meEndpoint: string,
  mediaRequirements: {
    maxFileSizeMb: number,
    acceptedVideoFormats: string[],
    acceptedImageFormats: string[],
    maxVideoDurationSeconds: number,
    recommendedAspectRatios: string[],
    requiredAspectRatios: string[] | null, // null = flexible
    maxImages: number,
    maxVideos: number,
  }
}
```

Media requirements reference:
- **YouTube**: 16:9 required (standard), 9:16 required (Shorts), mp4/mov
- **TikTok**: 9:16 required, mp4/mov, max 600s
- **Instagram**: 1:1 or 4:5 (feed), 9:16 (Reels), max 60s Reels
- **X**: 16:9 or 1:1 recommended, max 140s
- **Facebook**: flexible, 16:9 or 1:1 recommended
- **LinkedIn**: 1:1 or 1.91:1 recommended
- **Pinterest**: 2:3 recommended
- **Threads/Bluesky/Mastodon/Tumblr/Reddit**: flexible

---

## PROJECT FILE STRUCTURE

```
app/
  routes/
    _auth/
      login.tsx
      register.tsx
      verify-email.tsx
      forgot-password.tsx
      reset-password.tsx
    _dashboard/
      $workspaceSlug/
        index.tsx               # redirects to ./compose
        compose.tsx             # composer page
        posts/
          index.tsx             # posts list
          campaigns/
            $campaignId.tsx     # campaign detail view
        calendar.tsx
        media.tsx
        templates.tsx
        analytics.tsx
        accounts.tsx
        team.tsx
        settings/
          index.tsx             # general
          schedule.tsx
          notifications.tsx
          api.tsx
          white-label.tsx
    api/
      auth/
        $.ts                    # Better Auth handler
      v1/
        posts/
          index.ts
          $id.ts
        media/
          index.ts
          $id.ts
        accounts.ts
        analytics.ts
      notifications/
        unread-count.ts
  components/
    layout/
      Sidebar.tsx
      TopBar.tsx
      WorkspaceSwitcher.tsx
      NotificationBell.tsx
    composer/
      ComposerPage.tsx
      ModeToggle.tsx            # Standard / Campaign toggle
      StandardComposer.tsx
      CampaignComposer.tsx
      CampaignStepCard.tsx
      PlatformSelector.tsx
      ContentEditor.tsx
      VersionTabs.tsx
      MediaZone.tsx
      MediaMismatchBanner.tsx
      PostPreview.tsx
      HashtagPicker.tsx
      AIAssistPanel.tsx
      SchedulePopover.tsx
    posts/
      PostsTable.tsx
      PostRow.tsx
      CampaignGroupRow.tsx
      PostStatusBadge.tsx
      PostTypeBadge.tsx
      BulkActionsBar.tsx
      ReshareEditor.tsx
    reshare/
      ReshareBrowser.tsx
      ReshareResultCard.tsx
      MonitoredAccountsPicker.tsx
    calendar/
      MonthView.tsx
      WeekView.tsx
      PostPill.tsx
      CalendarPostPopover.tsx
    media/
      MediaGrid.tsx
      FolderTree.tsx
      MediaUploader.tsx
      MediaAssetCard.tsx
      MediaPreviewModal.tsx
    analytics/
      StatCard.tsx
      FollowerGrowthChart.tsx
      EngagementBarChart.tsx
      EngagementDonut.tsx
      PostingHeatmap.tsx
      PlatformTable.tsx
      CampaignAnalyticsTab.tsx
    campaigns/
      CampaignDetail.tsx
      CampaignStepTimeline.tsx
      CampaignOnHoldBanner.tsx
    ui/                         # shadcn/ui components live here
  lib/
    auth.ts                     # Better Auth config
    platforms.ts                # Platform metadata
    utils.ts
    encryption.ts               # Token encryption/decryption
  server/
    db/
      schema.ts                 # Full Drizzle schema
      index.ts                  # DB connection + client
    services/
      posts.ts
      campaigns.ts
      accounts.ts
      media.ts
      analytics.ts
      ai.ts
      notifications.ts
    queues/
      connection.ts
      postQueue.ts
      campaignWorker.ts
      scheduler.ts
      analyticsSync.ts
    publishing/
      index.ts                  # routes to correct publisher
      original/
        facebook.ts · instagram.ts · x.ts · linkedin.ts
        tiktok.ts · youtube.ts · pinterest.ts · threads.ts
        bluesky.ts · mastodon.ts · tumblr.ts · reddit.ts
      reshare/
        x.ts · tumblr.ts · facebook.ts · linkedin.ts
        threads.ts · bluesky.ts · mastodon.ts · reddit.ts
    oauth/
      # Better Auth genericOAuth callbacks per platform
      callback.ts               # shared callback handler, saves to social_accounts
```

---

