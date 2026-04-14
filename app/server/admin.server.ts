import { desc, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { loadSessionContext } from './session.server'
import { getPostQueue } from './queues/postQueue'

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

export type AdminJobStats = {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  failedJobs: Array<{
    id: string
    name: string
    dataJson: string
    failedReason: string
    attemptsMade: number
    timestamp: number
  }>
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
  const ws = await db.select().from(schema.workspaces).orderBy(desc(schema.workspaces.createdAt))
  const out: AdminWorkspaceRow[] = []
  for (const w of ws) {
    const counts = await db
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, w.id))
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
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId))
  return { ok: true }
}

export async function getJobStatsImpl(): Promise<AdminJobStats> {
  await requireAdmin()
  if (!process.env.REDIS_URL) {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, failedJobs: [] }
  }
  const queue = getPostQueue()
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ])
  const jobs = await queue.getFailed(0, 50)
  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    failedJobs: jobs.map((j) => ({
      id: String(j.id),
      name: j.name,
      dataJson: JSON.stringify(j.data ?? {}),
      failedReason: j.failedReason ?? '',
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
    })),
  }
}

export async function retryJobImpl(jobId: string) {
  await requireAdmin()
  const queue = getPostQueue()
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
      workspaceName: schema.workspaces.name,
    })
    .from(schema.webhookDeliveries)
    .innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId))
    .leftJoin(schema.workspaces, eq(schema.workspaces.id, schema.webhooks.workspaceId))
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
