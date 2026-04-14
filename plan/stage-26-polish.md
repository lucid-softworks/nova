## STAGE 26 — Polish + remaining deferred items

Small, self-contained items that piled up across stages 3–17. Take them
off the list in whatever order feels right.

### Composer

- [ ] AI Assist inside CampaignComposer step editors (hook exists in
      `ai.server.ts`, just needs the button)
- [ ] AI Assist in the reshare quote-comment field (system prompt already
      handles this; wire up in `ReshareBrowser`)
- [ ] Emoji picker (replace the "coming later" alert in the toolbar)
- [ ] Reddit per-post fields persisted — title / subreddit / NSFW /
      spoiler currently collected but not saved (noted in Stage 4 worker
      stub); add a `post_reddit_details` table or fold into
      `post_versions.platformVariables`
- [ ] Edit existing post (composer currently only creates drafts — PATCH
      `/api/v1/posts/:id` exists; hook up the "Edit" action in Posts list)
- [ ] Composer pre-fill from a calendar slot click (pass date/time via
      URL or sessionStorage like we do for templates)
- [ ] Ffmpeg / image-size aspect-ratio check in `detectMismatches` (today
      we only check count + mime)

### Calendar

- [ ] Week-view drag-to-reschedule with hour snap
- [ ] Overlap collision handling (multiple posts in the same hour slot
      currently stack with minimal spacing)

### Posts list

- [ ] Label multi-select + author dropdown + date range picker (server
      filters already support them)
- [ ] Campaign row actions: Pause Campaign, Cancel Campaign, Duplicate
      Campaign (needs small campaign-worker hooks)
- [ ] Per-step Skip / Trigger Now on `/posts/campaigns/:id`
- [ ] Pending-approval inline activity timeline — `post_activity` rows
      expanded beneath each pending row

### Media

- [ ] Thumbnail generation (Sharp for images, ffmpeg first-frame for
      video). The schema already has `thumbnailUrl`.
- [ ] Logo upload buttons in Settings → General + White Label (the
      endpoint exists at `/api/media/upload`; swap the URL text input
      for a file picker)

### API

- [ ] `POST /api/v1/media`, `GET /api/v1/media`, `DELETE /api/v1/media/:id`
      as v1 aliases for existing `/api/media/*`
- [ ] Upstash Ratelimit via Redis instead of in-memory bucket
- [ ] OpenAPI spec auto-generated at `/api/v1/openapi.json` (Better Auth
      `openAPI()` plugin covers the `/api/auth/*` half)

### Other

- [ ] Dedicated `/notifications` page (bell dropdown covers it for now)
- [ ] Campaigns analytics tab (per-campaign reach + engagements rollup)
- [ ] Custom date range picker on analytics
