## DATABASE SCHEMA

Define all tables in `server/db/schema.ts` using Drizzle ORM.

### `users`
Managed by Better Auth. Columns: `id`, `email`, `name`, `avatarUrl`, `createdAt`

### `sessions`
Managed by Better Auth.

### `workspaces`
```
id, name, slug (unique), logoUrl, appName,
ownerId → users,
timezone (default 'UTC'), defaultLanguage (default 'en'),
requireApproval (boolean default false),
createdAt, updatedAt
```

### `workspace_members`
```
id, workspaceId → workspaces, userId → users,
role: enum('admin','manager','editor','viewer'),
invitedAt, joinedAt nullable
```

### `workspace_approvers`
```
id, workspaceId → workspaces, userId → users
```

### `social_accounts`
```
id, workspaceId → workspaces,
platform: enum('facebook','instagram','threads','x','linkedin',
               'youtube','tiktok','pinterest','mastodon','bluesky',
               'tumblr','reddit'),
accountName, accountHandle, avatarUrl,
accessToken (text, encrypted at rest),
refreshToken (text nullable, encrypted),
tokenExpiresAt (timestamp nullable),
metadata (jsonb default '{}'),
  # stores extra per-platform data:
  # reddit: { subscribedSubreddits: string[] }
  # mastodon: { instanceUrl: string }
  # bluesky: { did: string }
  # youtube: { channelId: string }
  # facebook: { pageId: string, pageAccessToken: string (encrypted) }
status: enum('connected','disconnected','expired') default 'connected',
lastSyncedAt (timestamp nullable),
createdAt
```

### `campaigns`
```
id, workspaceId → workspaces, authorId → users,
name,
status: enum('draft','scheduled','publishing','published',
             'failed','partial','on_hold') default 'draft',
createdAt, updatedAt
```

### `campaign_steps`
```
id, campaignId → campaigns,
postId → posts,
stepOrder (integer),
dependsOnStepId → campaign_steps nullable (self-reference),
triggerType: enum('immediate','delay','scheduled') nullable,
triggerDelayMinutes (integer nullable),
triggerScheduledAt (timestamp nullable),
status: enum('waiting','ready','publishing','published',
             'failed','on_hold','skipped') default 'waiting',
createdAt
```

### `posts`
```
id, workspaceId → workspaces, authorId → users,
type: enum('original','reshare') default 'original',
status: enum('draft','scheduled','publishing','published',
             'failed','pending_approval') default 'draft',
campaignId → campaigns nullable,
campaignStepId → campaign_steps nullable,
scheduledAt (timestamp nullable),
publishedAt (timestamp nullable),
failedAt (timestamp nullable),
failureReason (text nullable),
isQueue (boolean default false),
labels (text[] default '{}'),
createdAt, updatedAt
```

### `post_versions`
```
id, postId → posts,
platforms (text[]),          # which platforms this version targets
content (text default ''),
firstComment (text nullable),
isThread (boolean default false),
threadParts (jsonb default '[]'),
  # [{ content: string, mediaIds: string[] }]
isDefault (boolean default false),
platformVariables (jsonb default '{}'),
  # populated after publish: { youtube_url: '...', tiktok_url: '...' }
```

### `post_reshare_details`
```
id, postId → posts,
sourcePlatform: enum(same as social_accounts.platform),
sourcePostId, sourcePostUrl,
sourceAuthorHandle, sourceAuthorName,
sourceContent (text),
sourceMediaUrls (text[] default '{}'),
reshareType: enum('repost','quote','reblog','boost','crosspost','share'),
quoteComment (text nullable),
targetSubreddit (text nullable)
```

### `post_media`
```
id, postVersionId → post_versions,
mediaId → media_assets,
sortOrder (integer default 0)
```

### `post_platforms`
```
id, postId → posts, socialAccountId → social_accounts,
platformPostId (text nullable),
publishedUrl (text nullable),
status: enum('pending','published','failed') default 'pending',
failureReason (text nullable),
publishedAt (timestamp nullable)
```

### `post_activity`
```
id, postId → posts, userId → users,
action: enum('created','edited','scheduled','approved','rejected',
             'published','failed','reshared'),
note (text nullable),
createdAt
```

### `media_assets`
```
id, workspaceId → workspaces, uploadedById → users,
filename, originalName, mimeType, size (integer),
width (integer nullable), height (integer nullable),
duration (integer nullable),
url, thumbnailUrl (nullable),
folderId → media_folders nullable,
createdAt
```

### `media_folders`
```
id, workspaceId → workspaces,
name,
parentId → media_folders nullable (self-reference),
createdAt
```

### `templates`
```
id, workspaceId → workspaces,
name, content,
platforms (text[] default '{}'),
createdAt
```

### `hashtag_groups`
```
id, workspaceId → workspaces,
name,
hashtags (text[] default '{}'),
createdAt
```

### `monitored_accounts`
```
id, workspaceId → workspaces,
platform: enum(same as social_accounts.platform),
handle, displayName, avatarUrl (nullable),
addedById → users,
createdAt
```

### `posting_schedules`
```
id, workspaceId → workspaces,
dayOfWeek (integer 0–6),
times (text[])   # ["09:00", "17:00"]
```

### `analytics_snapshots`
```
id, socialAccountId → social_accounts,
campaignId → campaigns nullable,
date (date),
followers (integer), following (integer), posts (integer),
reach (integer), impressions (integer), engagements (integer),
likes (integer), comments (integer), shares (integer), clicks (integer),
createdAt
```

### `api_keys`
```
id, workspaceId → workspaces,
name, keyHash,
lastUsedAt (timestamp nullable),
createdAt
```

### `webhooks`
```
id, workspaceId → workspaces,
url, events (text[]),
secret,
isActive (boolean default true),
createdAt
```

### `webhook_deliveries`
```
id, webhookId → webhooks,
event, payload (jsonb),
statusCode (integer nullable),
responseBody (text nullable),
success (boolean),
attemptCount (integer default 1),
deliveredAt (timestamp nullable),
createdAt
```

### `notifications`
```
id, userId → users, workspaceId → workspaces,
type: enum('post_published','post_failed','approval_requested',
           'post_approved','post_rejected','member_joined',
           'campaign_on_hold'),
title, body,
data (jsonb default '{}'),
readAt (timestamp nullable),
createdAt
```

---

