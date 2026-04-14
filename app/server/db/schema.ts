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

export const workspaceRoleEnum = pgEnum('workspace_role', ['admin', 'manager', 'editor', 'viewer'])

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

export const workspaces = pgTable(
  'workspaces',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logoUrl: text('logo_url'),
    appName: text('app_name'),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    timezone: text('timezone').default('UTC').notNull(),
    defaultLanguage: text('default_language').default('en').notNull(),
    requireApproval: boolean('require_approval').default(false).notNull(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('workspaces_slug_idx').on(t.slug)],
)

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum('role').notNull(),
    invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow().notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('workspace_members_ws_user_idx').on(t.workspaceId, t.userId)],
)

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

