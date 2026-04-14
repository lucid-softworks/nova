import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  listUsersImpl,
  listWorkspacesImpl,
  deleteWorkspaceImpl,
  getJobStatsImpl,
  retryJobImpl,
  listWebhookDeliveriesImpl,
  type AdminUserRow,
  type AdminWorkspaceRow,
  type AdminWebhookDelivery,
  type AdminJobStats,
} from './admin.server'

export type { AdminUserRow, AdminWorkspaceRow, AdminWebhookDelivery, AdminJobStats }

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

const retrySchema = z.object({ jobId: z.string().min(1) })

export const retryAdminJob = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => retrySchema.parse(d))
  .handler(async ({ data }) => retryJobImpl(data.jobId))

export const listAdminWebhookDeliveries = createServerFn({ method: 'GET' }).handler(async () =>
  listWebhookDeliveriesImpl(),
)
