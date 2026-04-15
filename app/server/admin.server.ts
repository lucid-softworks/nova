import { desc, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { loadSessionContext } from './session.server'
import { getPostQueue } from './queues/postQueue'
import { getAnalyticsQueue } from './queues/analyticsQueue'
import type { Queue } from 'bullmq'

export type AdminUserRow = {
  id: string
  email: string
  name: string
  role: string | null
  banned: boolean
  createdAt: string
}

export type AdminWorkspaceRow = {
  id: string
  name: string
  slug: string
  createdAt: string
  memberCount: number
}

export type AdminWebhookDelivery = {
  id: string
  event: string
  success: boolean
  statusCode: number | null
  createdAt: string
  workspaceName: string | null
}

export type QueueName = 'posts' | 'analytics'

export type AdminJobFailure = {
  id: string
  queue: QueueName
  name: string
  dataJson: string
  failedReason: string
  attemptsMade: number
  timestamp: number
}

export type AdminJobQueueStats = {
  queue: QueueName
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

export type AdminJobStats = {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  queues: AdminJobQueueStats[]
  failedJobs: AdminJobFailure[]
}

async function requireAdmin() {
  const ctx = await loadSessionContext()
  if (!ctx.user) throw new Error('unauthenticated')
  const row = await db.query.user.findFirst({ where: eq(schema.user.id, ctx.user.id) })
  if (row?.role !== 'admin') throw new Error('forbidden')
  return row
}

export async function listUsersImpl(): Promise<AdminUserRow[]> {
  await requireAdmin()
  const rows = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
      role: schema.user.role,
      banned: schema.user.banned,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .orderBy(desc(schema.user.createdAt))
    .limit(200)
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    banned: r.banned ?? false,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function listWorkspacesImpl(): Promise<AdminWorkspaceRow[]> {
  await requireAdmin()
  const ws = await db
    .select({
      id: schema.workspaces.id,
      organizationId: schema.workspaces.organizationId,
      name: schema.organization.name,
      slug: schema.organization.slug,
      createdAt: schema.workspaces.createdAt,
    })
    .from(schema.workspaces)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.workspaces.organizationId))
    .orderBy(desc(schema.workspaces.createdAt))
  const out: AdminWorkspaceRow[] = []
  for (const w of ws) {
    const counts = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.organizationId, w.organizationId))
    out.push({
      id: w.id,
      name: w.name,
      slug: w.slug,
      createdAt: w.createdAt.toISOString(),
      memberCount: counts.length,
    })
  }
  return out
}

export async function deleteWorkspaceImpl(workspaceId: string) {
  await requireAdmin()
  // Find the org backing this workspace and cascade-delete it; that takes
  // the workspaces satellite, members, and invitations with it.
  const ws = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  })
  if (!ws) return { ok: true }
  await db.delete(schema.organization).where(eq(schema.organization.id, ws.organizationId))
  return { ok: true }
}

async function queueStats<T>(
  name: QueueName,
  queue: Queue<T>,
): Promise<{ stats: AdminJobQueueStats; failed: AdminJobFailure[] }> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ])
  const jobs = await queue.getFailed(0, 25)
  return {
    stats: { queue: name, waiting, active, completed, failed, delayed },
    failed: jobs.map((j) => ({
      id: String(j.id),
      queue: name,
      name: j.name,
      dataJson: JSON.stringify(j.data ?? {}),
      failedReason: j.failedReason ?? '',
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
    })),
  }
}

export async function getJobStatsImpl(): Promise<AdminJobStats> {
  await requireAdmin()
  if (!process.env.REDIS_URL) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      queues: [],
      failedJobs: [],
    }
  }
  const [posts, analytics] = await Promise.all([
    queueStats('posts', getPostQueue()),
    queueStats('analytics', getAnalyticsQueue()),
  ])
  const queues = [posts.stats, analytics.stats]
  const totals = queues.reduce(
    (acc, q) => {
      acc.waiting += q.waiting
      acc.active += q.active
      acc.completed += q.completed
      acc.failed += q.failed
      acc.delayed += q.delayed
      return acc
    },
    { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
  )
  return {
    ...totals,
    queues,
    failedJobs: [...posts.failed, ...analytics.failed].sort((a, b) => b.timestamp - a.timestamp),
  }
}

export async function retryJobImpl(jobId: string, queueName: QueueName = 'posts') {
  await requireAdmin()
  const queue = queueName === 'analytics' ? getAnalyticsQueue() : getPostQueue()
  const job = await queue.getJob(jobId)
  if (!job) throw new Error('Job not found')
  await job.retry()
  return { ok: true }
}

export async function listWebhookDeliveriesImpl(): Promise<AdminWebhookDelivery[]> {
  await requireAdmin()
  const rows = await db
    .select({
      id: schema.webhookDeliveries.id,
      event: schema.webhookDeliveries.event,
      success: schema.webhookDeliveries.success,
      statusCode: schema.webhookDeliveries.statusCode,
      createdAt: schema.webhookDeliveries.createdAt,
      workspaceId: schema.workspaces.id,
      workspaceName: schema.organization.name,
    })
    .from(schema.webhookDeliveries)
    .innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId))
    .leftJoin(schema.workspaces, eq(schema.workspaces.id, schema.webhooks.workspaceId))
    .leftJoin(schema.organization, eq(schema.organization.id, schema.workspaces.organizationId))
    .orderBy(desc(schema.webhookDeliveries.createdAt))
    .limit(100)
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    success: r.success,
    statusCode: r.statusCode,
    createdAt: r.createdAt.toISOString(),
    workspaceName: r.workspaceName,
  }))
}
