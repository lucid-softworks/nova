import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  listUsersImpl,
  listWorkspacesImpl,
  deleteWorkspaceImpl,
  getJobStatsImpl,
  retryJobImpl,
  listWebhookDeliveriesImpl,
  getPlatformSettingsAdminImpl,
  updatePlatformSettingsImpl,
  inviteUserImpl,
  listAuditLogImpl,
  revokeUserSessionsImpl,
  resetUserTwoFactorImpl,
  markUserVerifiedImpl,
  resendVerificationImpl,
  getWorkspaceDetailImpl,
  type AdminUserRow,
  type AdminWorkspaceRow,
  type AdminWebhookDelivery,
  type AdminJobStats,
  type PlatformSettings,
  type InviteUserResult,
  type AdminAuditRow,
  type AdminWorkspaceDetail,
} from './admin.server'

export type { AdminUserRow, AdminWorkspaceRow, AdminWebhookDelivery, AdminJobStats, PlatformSettings, InviteUserResult, AdminAuditRow, AdminWorkspaceDetail }

export const listAdminUsers = createServerFn({ method: 'GET' }).handler(async () =>
  listUsersImpl(),
)

export const listAdminWorkspaces = createServerFn({ method: 'GET' }).handler(async () =>
  listWorkspacesImpl(),
)

const deleteWs = z.object({ workspaceId: z.string().uuid() })

export const deleteAdminWorkspace = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteWs.parse(d))
  .handler(async ({ data }) => deleteWorkspaceImpl(data.workspaceId))

export const getAdminJobStats = createServerFn({ method: 'GET' }).handler(async () =>
  getJobStatsImpl(),
)

const retrySchema = z.object({
  jobId: z.string().min(1),
  queue: z.enum(['posts', 'analytics']).default('posts'),
})

export const retryAdminJob = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => retrySchema.parse(d))
  .handler(async ({ data }) => retryJobImpl(data.jobId, data.queue))

export const listAdminWebhookDeliveries = createServerFn({ method: 'GET' }).handler(async () =>
  listWebhookDeliveriesImpl(),
)

export const getAdminPlatformSettings = createServerFn({ method: 'GET' }).handler(async () =>
  getPlatformSettingsAdminImpl(),
)

const platformSettingsSchema = z.object({
  signupsEnabled: z.boolean(),
  signupRateLimitMax: z.number().int().min(1).max(10000).nullable(),
  signupRateLimitWindowHours: z.number().int().min(1).max(720),
  signupEmailAllowlist: z.array(z.string().min(1).max(253)).max(500),
  signupEmailBlocklist: z.array(z.string().min(1).max(253)).max(500),
  disabledPlatforms: z.array(z.string().min(1).max(50)).max(50),
  maintenanceMode: z.boolean(),
  announcementBanner: z.string().max(500).nullable(),
  featureFlags: z.record(z.string(), z.boolean()),
})

export const updateAdminPlatformSettings = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => platformSettingsSchema.parse(d))
  .handler(async ({ data }) => updatePlatformSettingsImpl(data))

const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
})

export const inviteAdminUser = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => inviteUserSchema.parse(d))
  .handler(async ({ data }) => inviteUserImpl(data.email, data.name))

export const listAdminAuditLog = createServerFn({ method: 'GET' }).handler(async () =>
  listAuditLogImpl(),
)

const userIdSchema = z.object({ userId: z.string().min(1) })

export const revokeAdminUserSessions = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data }) => revokeUserSessionsImpl(data.userId))

export const resetAdminUserTwoFactor = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data }) => resetUserTwoFactorImpl(data.userId))

export const markAdminUserVerified = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data }) => markUserVerifiedImpl(data.userId))

export const resendAdminVerification = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data }) => resendVerificationImpl(data.userId))

const workspaceIdSchema = z.object({ workspaceId: z.string().uuid() })

export const getAdminWorkspaceDetail = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => workspaceIdSchema.parse(d))
  .handler(async ({ data }) => getWorkspaceDetailImpl(data.workspaceId))
