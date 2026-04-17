import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  uuid,
  uniqueIndex,
  index,
  AnyPgColumn,
} from 'drizzle-orm/pg-core'

const id = () => uuid('id').defaultRandom().primaryKey()
const now = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull()

// -- Enums ------------------------------------------------------------------

export const platformEnum = pgEnum('platform', [
  'facebook',
  'instagram',
  'threads',
  'x',
  'linkedin',
  'youtube',
  'tiktok',
  'pinterest',
  'mastodon',
  'bluesky',
  'tumblr',
  'reddit',
])

// workspaceRoleEnum retired — roles now live on Better Auth's organization
// plugin `member.role` column as free-form strings (admin / manager / editor
// / viewer), validated via createAccessControl in app/lib/auth.ts.

export const socialAccountStatusEnum = pgEnum('social_account_status', [
  'connected',
  'disconnected',
  'expired',
])

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'partial',
  'on_hold',
  'paused',
  'cancelled',
])

export const campaignStepStatusEnum = pgEnum('campaign_step_status', [
  'waiting',
  'ready',
  'publishing',
  'published',
  'failed',
  'on_hold',
  'skipped',
])

export const campaignStepTriggerEnum = pgEnum('campaign_step_trigger', [
  'immediate',
  'delay',
  'scheduled',
])

export const postTypeEnum = pgEnum('post_type', ['original', 'reshare'])

export const postStatusEnum = pgEnum('post_status', [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'pending_approval',
])

export const reshareTypeEnum = pgEnum('reshare_type', [
  'repost',
  'quote',
  'reblog',
  'boost',
  'crosspost',
  'share',
])

export const postPlatformStatusEnum = pgEnum('post_platform_status', [
  'pending',
  'published',
  'failed',
])

export const postActivityEnum = pgEnum('post_activity_action', [
  'created',
  'edited',
  'scheduled',
  'approved',
  'rejected',
  'published',
  'failed',
  'reshared',
])

export const notificationTypeEnum = pgEnum('notification_type', [
  'post_published',
  'post_failed',
  'approval_requested',
  'post_approved',
  'post_rejected',
  'member_joined',
  'campaign_on_hold',
])

// -- Better Auth managed tables --------------------------------------------
// Better Auth expects particular columns; we define them explicitly for
// Drizzle typing. Keep column names in sync with Better Auth defaults.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  avatarUrl: text('avatar_url'),
  twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
  notificationPreferences: jsonb('notification_preferences').default({}).notNull(),
  digestOptIn: boolean('digest_opt_in').default(false).notNull(),
  brrrWebhookSecret: text('brrr_webhook_secret'),
  // Better Auth admin plugin
  role: text('role'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  // Better Auth admin plugin: set when an admin is impersonating this user.
  impersonatedBy: text('impersonated_by'),
  // Organization plugin: which org this session is "focused on".
  activeOrganizationId: text('active_organization_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Better Auth Two-Factor plugin — `twoFactor` table holds TOTP secrets +
// backup codes per user.
export const twoFactor = pgTable(
  'twoFactor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean('verified').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('two_factor_user_id_idx').on(t.userId), index('two_factor_secret_idx').on(t.secret)],
)

// Better Auth Passkey plugin (@better-auth/passkey) — WebAuthn credentials.
export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_i_d').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('passkey_user_id_idx').on(t.userId), index('passkey_credential_id_idx').on(t.credentialID)],
)

// Better Auth API Key plugin (@better-auth/api-key) — table name is fixed
// by the plugin as "apikey"; columns must match its schema.
export const apikey = pgTable(
  'apikey',
  {
    id: text('id').primaryKey(),
    configId: text('config_id').notNull().default('default'),
    name: text('name'),
    start: text('start'),
    referenceId: text('reference_id').notNull(),
    prefix: text('prefix'),
    key: text('key').notNull(),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: timestamp('last_refill_at', { withTimezone: true }),
    enabled: boolean('enabled').default(true).notNull(),
    rateLimitEnabled: boolean('rate_limit_enabled').default(true).notNull(),
    rateLimitTimeWindow: integer('rate_limit_time_window'),
    rateLimitMax: integer('rate_limit_max'),
    requestCount: integer('request_count').default(0).notNull(),
    remaining: integer('remaining'),
    lastRequest: timestamp('last_request', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (t) => [
    index('apikey_config_id_idx').on(t.configId),
    index('apikey_reference_id_idx').on(t.referenceId),
    index('apikey_key_idx').on(t.key),
  ],
)

// -- Domain tables ---------------------------------------------------------

// -- Better Auth Organization plugin tables ---------------------------------
// These are owned by the plugin; we just declare them so Drizzle can talk
// to them and so db:push reflects their shape. Identity (name/slug/logo)
// lives here now instead of on our satellite `workspaces` row.

export const organization = pgTable(
  'organization',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logo: text('logo'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: text('metadata'),
  },
  (t) => [uniqueIndex('organization_slug_idx').on(t.slug)],
)

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('member_org_user_idx').on(t.organizationId, t.userId)],
)

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  inviterId: text('inviter_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

// -- Satellite for our domain-specific workspace columns --------------------
// 1:1 with organization via organizationId. We keep the uuid PK so every
// existing foreign key that refers to workspaceId keeps working unchanged.

export const workspaces = pgTable(
  'workspaces',
  {
    id: id(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    appName: text('app_name'),
    timezone: text('timezone').default('UTC').notNull(),
    defaultLanguage: text('default_language').default('en').notNull(),
    requireApproval: boolean('require_approval').default(false).notNull(),
    calendarFeedToken: text('calendar_feed_token').unique(),
    customDomain: text('custom_domain').unique(),
    domainVerified: boolean('domain_verified').default(false).notNull(),
    utmDefaults: jsonb('utm_defaults').$type<Record<string, string>>().default({}).notNull(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('workspaces_org_idx').on(t.organizationId)],
)

// Approvers still live here — no equivalent in the org plugin.
export const workspaceApprovers = pgTable(
  'workspace_approvers',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('workspace_approvers_ws_user_idx').on(t.workspaceId, t.userId)],
)

export const socialAccounts = pgTable('social_accounts', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  platform: platformEnum('platform').notNull(),
  accountName: text('account_name').notNull(),
  accountHandle: text('account_handle').notNull(),
  avatarUrl: text('avatar_url'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}).notNull(),
  status: socialAccountStatusEnum('status').default('connected').notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: now(),
})

export const campaigns = pgTable('campaigns', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  authorId: text('author_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  status: campaignStatusEnum('status').default('draft').notNull(),
  createdAt: now(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const posts = pgTable(
  'posts',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    type: postTypeEnum('type').default('original').notNull(),
    status: postStatusEnum('status').default('draft').notNull(),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    campaignStepId: uuid('campaign_step_id').references((): AnyPgColumn => campaignSteps.id, {
      onDelete: 'set null',
    }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    isQueue: boolean('is_queue').default(false).notNull(),
    labels: text('labels').array().default([]).notNull(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('posts_workspace_status_idx').on(t.workspaceId, t.status),
    index('posts_scheduled_idx').on(t.scheduledAt),
  ],
)

export const campaignSteps = pgTable('campaign_steps', {
  id: id(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'set null' }),
  stepOrder: integer('step_order').notNull(),
  dependsOnStepId: uuid('depends_on_step_id').references((): AnyPgColumn => campaignSteps.id, {
    onDelete: 'set null',
  }),
  triggerType: campaignStepTriggerEnum('trigger_type'),
  triggerDelayMinutes: integer('trigger_delay_minutes'),
  triggerScheduledAt: timestamp('trigger_scheduled_at', { withTimezone: true }),
  status: campaignStepStatusEnum('status').default('waiting').notNull(),
  createdAt: now(),
})

export const postVersions = pgTable('post_versions', {
  id: id(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  platforms: text('platforms').array().notNull(),
  content: text('content').default('').notNull(),
  firstComment: text('first_comment'),
  isThread: boolean('is_thread').default(false).notNull(),
  threadParts: jsonb('thread_parts').default([]).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  platformVariables: jsonb('platform_variables').default({}).notNull(),
})

export const postReshareDetails = pgTable('post_reshare_details', {
  id: id(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  sourcePlatform: platformEnum('source_platform').notNull(),
  sourcePostId: text('source_post_id').notNull(),
  sourcePostUrl: text('source_post_url').notNull(),
  sourceAuthorHandle: text('source_author_handle').notNull(),
  sourceAuthorName: text('source_author_name').notNull(),
  sourceContent: text('source_content').notNull(),
  sourceMediaUrls: text('source_media_urls').array().default([]).notNull(),
  reshareType: reshareTypeEnum('reshare_type').notNull(),
  quoteComment: text('quote_comment'),
  targetSubreddit: text('target_subreddit'),
})

export const mediaFolders = pgTable('media_folders', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => mediaFolders.id, {
    onDelete: 'set null',
  }),
  createdAt: now(),
})

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    uploadedById: text('uploaded_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    filename: text('filename').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    duration: integer('duration'),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    folderId: uuid('folder_id').references(() => mediaFolders.id, { onDelete: 'set null' }),
    contentHash: text('content_hash'),
    createdAt: now(),
  },
  (t) => [index('media_assets_ws_hash_idx').on(t.workspaceId, t.contentHash)],
)

export const postMedia = pgTable('post_media', {
  id: id(),
  postVersionId: uuid('post_version_id')
    .notNull()
    .references(() => postVersions.id, { onDelete: 'cascade' }),
  mediaId: uuid('media_id')
    .notNull()
    .references(() => mediaAssets.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0).notNull(),
})

export const postPlatforms = pgTable('post_platforms', {
  id: id(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  socialAccountId: uuid('social_account_id')
    .notNull()
    .references(() => socialAccounts.id, { onDelete: 'cascade' }),
  platformPostId: text('platform_post_id'),
  publishedUrl: text('published_url'),
  status: postPlatformStatusEnum('status').default('pending').notNull(),
  failureReason: text('failure_reason'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
})

export const postActivity = pgTable('post_activity', {
  id: id(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  action: postActivityEnum('action').notNull(),
  note: text('note'),
  createdAt: now(),
})

export const templates = pgTable('templates', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  content: text('content').notNull(),
  platforms: text('platforms').array().default([]).notNull(),
  createdAt: now(),
})

export const hashtagGroups = pgTable('hashtag_groups', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  hashtags: text('hashtags').array().default([]).notNull(),
  createdAt: now(),
})

export const monitoredAccounts = pgTable('monitored_accounts', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  platform: platformEnum('platform').notNull(),
  handle: text('handle').notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  addedById: text('added_by_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  createdAt: now(),
})

export const postingSchedules = pgTable('posting_schedules', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  times: text('times').array().default([]).notNull(),
})

export const analyticsSnapshots = pgTable('analytics_snapshots', {
  id: id(),
  socialAccountId: uuid('social_account_id')
    .notNull()
    .references(() => socialAccounts.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  followers: integer('followers').default(0).notNull(),
  following: integer('following').default(0).notNull(),
  posts: integer('posts').default(0).notNull(),
  reach: integer('reach').default(0).notNull(),
  impressions: integer('impressions').default(0).notNull(),
  engagements: integer('engagements').default(0).notNull(),
  likes: integer('likes').default(0).notNull(),
  comments: integer('comments').default(0).notNull(),
  shares: integer('shares').default(0).notNull(),
  clicks: integer('clicks').default(0).notNull(),
  createdAt: now(),
})

export const inboxItems = pgTable(
  'inbox_items',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    socialAccountId: uuid('social_account_id')
      .notNull()
      .references(() => socialAccounts.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    platformItemId: text('platform_item_id').notNull(),
    kind: text('kind').notNull(),
    actorHandle: text('actor_handle'),
    actorName: text('actor_name'),
    actorAvatar: text('actor_avatar'),
    content: text('content'),
    permalink: text('permalink'),
    itemCreatedAt: timestamp('item_created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    postPlatformId: uuid('post_platform_id').references(() => postPlatforms.id, {
      onDelete: 'set null',
    }),
    createdAt: now(),
  },
  (t) => ({
    acctItemUnq: uniqueIndex('inbox_items_account_item_unq').on(
      t.socialAccountId,
      t.platformItemId,
    ),
    workspaceIdx: index('inbox_items_workspace_idx').on(t.workspaceId, t.itemCreatedAt),
  }),
)

export const rssFeeds = pgTable(
  'rss_feeds',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdById: text('created_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    url: text('url').notNull(),
    title: text('title'),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    autoPublish: boolean('auto_publish').default(false).notNull(),
    defaultAccountIds: jsonb('default_account_ids')
      .$type<string[]>()
      .default([])
      .notNull(),
    contentTemplate: text('content_template')
      .default('{{title}}\n\n{{link}}')
      .notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: now(),
  },
  (t) => ({
    workspaceIdx: index('rss_feeds_workspace_idx').on(t.workspaceId),
  }),
)

export const rssFeedItems = pgTable(
  'rss_feed_items',
  {
    id: id(),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => rssFeeds.id, { onDelete: 'cascade' }),
    guid: text('guid').notNull(),
    link: text('link'),
    title: text('title'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'set null' }),
    createdAt: now(),
  },
  (t) => ({
    feedGuidUnq: uniqueIndex('rss_feed_items_feed_guid_unq').on(t.feedId, t.guid),
  }),
)

export const recurringPosts = pgTable('recurring_posts', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  sourcePostId: uuid('source_post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  cronExpression: text('cron_expression').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  socialAccountIds: jsonb('social_account_ids').$type<string[]>().default([]).notNull(),
  active: boolean('active').default(true).notNull(),
  lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
  nextFireAt: timestamp('next_fire_at', { withTimezone: true }),
  createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: now(),
})

export const savedReplies = pgTable('saved_replies', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  shortcut: text('shortcut'),
  createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: now(),
})

export const shortLinks = pgTable(
  'short_links',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    targetUrl: text('target_url').notNull(),
    createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    clickCount: integer('click_count').default(0).notNull(),
    externalId: text('external_id'),
    createdAt: now(),
  },
  (t) => ({
    slugUnq: uniqueIndex('short_links_slug_unq').on(t.slug),
    workspaceIdx: index('short_links_workspace_idx').on(t.workspaceId),
  }),
)

export const workspaceSubscriptions = pgTable('workspace_subscriptions', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .unique(),
  provider: text('provider').notNull(),
  customerId: text('customer_id'),
  subscriptionId: text('subscription_id'),
  plan: text('plan'),
  status: text('status').notNull().default('none'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: now(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const postMetricsSnapshots = pgTable(
  'post_metrics_snapshots',
  {
    id: id(),
    postPlatformId: uuid('post_platform_id')
      .notNull()
      .references(() => postPlatforms.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    likes: integer('likes').default(0).notNull(),
    comments: integer('comments').default(0).notNull(),
    shares: integer('shares').default(0).notNull(),
    reach: integer('reach').default(0).notNull(),
    impressions: integer('impressions').default(0).notNull(),
    engagements: integer('engagements').default(0).notNull(),
    clicks: integer('clicks').default(0).notNull(),
    views: integer('views').default(0).notNull(),
    createdAt: now(),
  },
  (t) => ({
    uniqPlatformDate: uniqueIndex('post_metrics_snapshots_platform_date_unq').on(
      t.postPlatformId,
      t.date,
    ),
  }),
)

export const contentSeries = pgTable('content_series', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  slots: jsonb('slots').$type<Array<{ dayOffset: number; timeOfDay: string; contentHint: string; platforms: string[] }>>().default([]).notNull(),
  isBuiltIn: boolean('is_built_in').default(false).notNull(),
  createdAt: now(),
})

export const bioPages = pgTable('bio_pages', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }).unique(),
  handle: text('handle').notNull().unique(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  theme: text('theme').default('default').notNull(),
  links: jsonb('links').$type<Array<{ title: string; url: string }>>().default([]).notNull(),
  showRecentPosts: boolean('show_recent_posts').default(true).notNull(),
  recentPostCount: integer('recent_post_count').default(6).notNull(),
  createdAt: now(),
})

export const approvalTokens = pgTable('approval_tokens', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name'),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: now(),
})

// The legacy per-workspace api_keys table has been replaced by Better Auth's
// apikey table (defined above). Keys are issued to users; the API Key plugin
// also resolves a session from the bearer header on inbound requests.

export const webhooks = pgTable('webhooks', {
  id: id(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  events: text('events').array().default([]).notNull(),
  secret: text('secret').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: now(),
})

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: id(),
  webhookId: uuid('webhook_id')
    .notNull()
    .references(() => webhooks.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull(),
  statusCode: integer('status_code'),
  responseBody: text('response_body'),
  success: boolean('success').default(false).notNull(),
  attemptCount: integer('attempt_count').default(1).notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: now(),
})

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').default({}).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [index('notifications_user_unread_idx').on(t.userId, t.readAt)],
)

// Singleton row (id = 'singleton') holding platform-wide admin toggles.
// Array/record fields default to [] / {} so reads never need null checks.
export const platformSettings = pgTable('platform_settings', {
  id: text('id').primaryKey().default('singleton'),
  signupsEnabled: boolean('signups_enabled').default(true).notNull(),
  signupRateLimitMax: integer('signup_rate_limit_max'),
  signupRateLimitWindowHours: integer('signup_rate_limit_window_hours').default(1).notNull(),
  // Case-insensitive email domain lists. Allowlist, when non-empty, is
  // strictly enforced (must match). Blocklist rejects regardless of
  // allowlist.
  signupEmailAllowlist: jsonb('signup_email_allowlist').$type<string[]>().default([]).notNull(),
  signupEmailBlocklist: jsonb('signup_email_blocklist').$type<string[]>().default([]).notNull(),
  // PlatformKey values (strings). Listed platforms are hidden from the
  // connect-account UI even when OAuth creds are configured.
  disabledPlatforms: jsonb('disabled_platforms').$type<string[]>().default([]).notNull(),
  maintenanceMode: boolean('maintenance_mode').default(false).notNull(),
  announcementBanner: text('announcement_banner'),
  // Boolean map of feature flags. Missing key => feature enabled.
  // Known keys: aiAssist, campaigns, analytics, scheduling, bioPages.
  featureFlags: jsonb('feature_flags').$type<Record<string, boolean>>().default({}).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Append-only log of platform-admin actions. Every mutation that runs
// with admin privilege should write a row so we can answer "who did what"
// after the fact. Target fields are free-form strings so any entity type
// can be referenced (user, workspace, settings, …).
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: id(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: now(),
  },
  (t) => [index('admin_audit_log_created_idx').on(t.createdAt)],
)

