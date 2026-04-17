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
  type AdminUserRow,
  type AdminWorkspaceRow,
  type AdminWebhookDelivery,
  type AdminJobStats,
  type PlatformSettings,
} from './admin.server'

export type { AdminUserRow, AdminWorkspaceRow, AdminWebhookDelivery, AdminJobStats, PlatformSettings }

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
})

export const updateAdminPlatformSettings = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => platformSettingsSchema.parse(d))
  .handler(async ({ data }) => updatePlatformSettingsImpl(data))
