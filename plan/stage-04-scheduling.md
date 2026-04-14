## STAGE 4 — Scheduling + Queue + BullMQ Infrastructure

### Scheduling UI additions to composer bottom bar

Replace "Save Draft" single button with an action group:
- **"Save Draft"** (secondary/ghost button)
- **"Schedule"** (primary button) → opens scheduling popover:
  - Date picker + time picker (timezone-aware, displays workspace timezone)
  - "Schedule Post" confirm button → saves with `status: 'scheduled'`, `scheduledAt` set
- **"Add to Queue"** → assigns next available queue slot (see logic below)
- **"Publish Now"** → sets `scheduledAt = now`, `status: 'scheduled'`

"Add to Queue" logic:
1. Fetch `posting_schedules` for workspace, sorted by `dayOfWeek` + time
2. Fetch all posts where `isQueue = true` AND `status = 'scheduled'`, sorted by `scheduledAt`
3. Walk through schedule slots starting from now; find first slot with no post assigned
4. Set `scheduledAt` to that slot, `isQueue = true`
5. If no schedule is configured: show a toast with a link to Settings → Posting Schedule

### BullMQ setup (`server/queues/`)

**`connection.ts`**: Redis connection using `REDIS_URL`. Export a shared `IORedis` instance.

**`postQueue.ts`**: Define a Bull Queue named `"posts"`. Each job payload:
```ts
{
  postId: string,
  workspaceId: string,
}
```

**`scheduler.ts`**: A cron job that runs every 60 seconds:
- Query posts where `scheduledAt <= now` AND `status = 'scheduled'` AND `campaignId IS NULL`
- For each: add a job to `postQueue`, update `status = 'publishing'`
- Also check `campaign_steps` where `status = 'ready'` and `triggerScheduledAt <= now`
  and enqueue those too

**`worker.ts`**: Processes `postQueue` jobs:
1. Fetch post + all versions + target accounts from DB
2. For each target `social_account`:
   a. Determine which `post_version` applies to this platform
   b. Resolve `{step_N_platform_url}` variables (for campaign posts) from `platformVariables`
   c. Call `publishPost(account, version, media)` or `resharePost(account, reshareDetails)`
   d. On success: update `post_platforms` record, save `platformPostId` + `publishedUrl`
   e. Save returned URL to `post_versions.platformVariables` keyed by `urlVariableName`
3. After all accounts processed:
   - If all succeeded: `post.status = 'published'`, create `post_activity (published)`
   - If any failed: `post.status = 'failed'`, save `failureReason`, create `post_activity (failed)`
4. Retry failed jobs up to 3× with exponential backoff (30s, 2min, 10min)
5. If this post belongs to a campaign: call `campaignWorker.onStepComplete(stepId, success)`

**`campaignWorker.ts`**: Orchestrates campaign step sequencing:

`onStepComplete(stepId, success)`:
1. Update `campaign_steps.status` to `published` or `failed`
2. If failed: set all dependent steps to `on_hold`, set `campaign.status = 'on_hold'`
   Create notification: `campaign_on_hold`
3. If succeeded: find dependent steps where `dependsOnStepId = stepId`
   For each dependent step, evaluate `triggerType`:
   - `immediate`: enqueue job now, set step `status = 'publishing'`
   - `delay`: enqueue with delay of `triggerDelayMinutes * 60 * 1000`ms
   - `scheduled`: if `triggerScheduledAt > now` → schedule for that time
                  if `triggerScheduledAt <= now` → set `on_hold`, notify user
4. Recompute `campaign.status`:
   - All steps published → `published`
   - Any `on_hold` → `on_hold`
   - Mix of published + failed → `partial`
   - All failed → `failed`

**Publishing stubs** (`server/publishing/original/*.ts` and `server/publishing/reshare/*.ts`):
All 12 original publishers + 8 reshare publishers created as stubs:
```ts
export async function publishPost(account, version, media): Promise<PublishResult> {
  console.log(`[STUB] Publishing to ${account.platform} for account ${account.accountHandle}`)
  return {
    platformPostId: `stub_${Date.now()}`,
    url: `https://${account.platform}.com/stub/${Date.now()}`,
    publishedAt: new Date(),
  }
}
```

**`analyticsSync.ts`**: A daily BullMQ cron job (runs at 02:00 UTC) — stub in this stage,
implemented fully in Stage 14.

---

