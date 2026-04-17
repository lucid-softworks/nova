import { randomBytes } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '~/lib/auth'
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
  emailVerified: boolean
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

/**
 * Append a row to the admin audit log. Best-effort — never throw,
 * because losing audit context shouldn't fail the underlying action.
 * Callers must have already verified admin status; we re-read the
 * actor from the session to record it.
 */
export async function writeAudit(
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const ctx = await loadSessionContext()
    const actorUserId = ctx.user?.id ?? null
    await db.insert(schema.adminAuditLog).values({
      actorUserId,
      action,
      targetType,
      targetId,
      metadata,
    })
  } catch {
    // swallow — audit failure must not break the action
  }
}

export type AdminAuditRow = {
  id: string
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  action: string
  targetType: string | null
  targetId: string | null
  // Serialized as JSON text so TanStack Start's serializer is happy with
  // the arbitrary-shaped metadata payload. Callers parse on the client.
  metadataJson: string
  createdAt: string
}

export async function listAuditLogImpl(limit = 200): Promise<AdminAuditRow[]> {
  await requireAdmin()
  const rows = await db
    .select({
      id: schema.adminAuditLog.id,
      actorUserId: schema.adminAuditLog.actorUserId,
      actorName: schema.user.name,
      actorEmail: schema.user.email,
      action: schema.adminAuditLog.action,
      targetType: schema.adminAuditLog.targetType,
      targetId: schema.adminAuditLog.targetId,
      metadata: schema.adminAuditLog.metadata,
      createdAt: schema.adminAuditLog.createdAt,
    })
    .from(schema.adminAuditLog)
    .leftJoin(schema.user, eq(schema.user.id, schema.adminAuditLog.actorUserId))
    .orderBy(desc(schema.adminAuditLog.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    actorUserId: r.actorUserId,
    actorName: r.actorName,
    actorEmail: r.actorEmail,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    metadataJson: JSON.stringify(r.metadata ?? {}),
    createdAt: r.createdAt.toISOString(),
  }))
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
      emailVerified: schema.user.emailVerified,
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
    emailVerified: r.emailVerified ?? false,
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
  const org = await db.query.organization.findFirst({
    where: eq(schema.organization.id, ws.organizationId),
  })
  await db.delete(schema.organization).where(eq(schema.organization.id, ws.organizationId))
  await writeAudit('workspace.delete', 'workspace', workspaceId, {
    organizationId: ws.organizationId,
    name: org?.name ?? null,
    slug: org?.slug ?? null,
  })
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
  await writeAudit('job.retry', 'job', jobId, { queue: queueName })
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

export type PlatformSettings = {
  signupsEnabled: boolean
  signupRateLimitMax: number | null
  signupRateLimitWindowHours: number
}

const DEFAULT_SETTINGS: PlatformSettings = {
  signupsEnabled: true,
  signupRateLimitMax: null,
  signupRateLimitWindowHours: 1,
}

/**
 * Reads the singleton platform settings row. Callable without admin
 * credentials because the signup hook needs it on every sign-up.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const row = await db.query.platformSettings.findFirst({
    where: eq(schema.platformSettings.id, 'singleton'),
  })
  if (!row) return DEFAULT_SETTINGS
  return {
    signupsEnabled: row.signupsEnabled,
    signupRateLimitMax: row.signupRateLimitMax,
    signupRateLimitWindowHours: row.signupRateLimitWindowHours,
  }
}

export async function getPlatformSettingsAdminImpl(): Promise<PlatformSettings> {
  await requireAdmin()
  return getPlatformSettings()
}

export async function updatePlatformSettingsImpl(input: PlatformSettings): Promise<PlatformSettings> {
  await requireAdmin()
  await db
    .insert(schema.platformSettings)
    .values({ id: 'singleton', ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.platformSettings.id,
      set: { ...input, updatedAt: new Date() },
    })
  await writeAudit('settings.update', 'settings', 'singleton', input as unknown as Record<string, unknown>)
  return input
}

export type InviteUserResult = { ok: true; userId: string } | { ok: false; error: string }

/**
 * Create a new user as admin and email them a magic-link so they can sign
 * in. The user is created with a random password they never learn — they
 * either keep signing in via magic-link or set a password in security
 * settings later. Bypasses the signup-disabled toggle because admin is
 * vouching for this account.
 */
export async function inviteUserImpl(email: string, name: string): Promise<InviteUserResult> {
  await requireAdmin()
  const headers = getRequest().headers

  const existing = await db.query.user.findFirst({ where: eq(schema.user.email, email) })
  if (existing) {
    return { ok: false, error: 'A user with that email already exists.' }
  }

  try {
    const created = await auth.api.createUser({
      headers,
      body: {
        email,
        name,
        password: randomBytes(24).toString('hex'),
        role: 'user',
      },
    })
    const userId = created.user.id
    // Admin vouches; skip email-verification gate.
    await db
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, userId))

    await auth.api.signInMagicLink({
      headers,
      body: { email, callbackURL: '/' },
    })
    await writeAudit('user.invite', 'user', userId, { email, name })
    return { ok: true, userId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invite failed' }
  }
}

/**
 * Delete every session row for a user. Any tab/device the user is signed
 * in on becomes unauthenticated on its next request. The user row itself
 * is untouched.
 */
export async function revokeUserSessionsImpl(userId: string): Promise<{ revoked: number }> {
  await requireAdmin()
  const deleted = await db
    .delete(schema.session)
    .where(eq(schema.session.userId, userId))
    .returning({ id: schema.session.id })
  await writeAudit('user.revokeSessions', 'user', userId, { count: deleted.length })
  return { revoked: deleted.length }
}

/**
 * Remove the user's 2FA enrollment. After this they can sign in with just
 * their password (and must re-enroll). For recovery when the authenticator
 * is lost.
 */
export async function resetUserTwoFactorImpl(userId: string): Promise<{ ok: true }> {
  await requireAdmin()
  await db.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, userId))
  await db
    .update(schema.user)
    .set({ twoFactorEnabled: false })
    .where(eq(schema.user.id, userId))
  await writeAudit('user.resetTwoFactor', 'user', userId)
  return { ok: true }
}

export async function markUserVerifiedImpl(userId: string): Promise<{ ok: true }> {
  await requireAdmin()
  await db
    .update(schema.user)
    .set({ emailVerified: true })
    .where(eq(schema.user.id, userId))
  await writeAudit('user.markVerified', 'user', userId)
  return { ok: true }
}

export async function resendVerificationImpl(userId: string): Promise<{ ok: true }> {
  await requireAdmin()
  const row = await db.query.user.findFirst({ where: eq(schema.user.id, userId) })
  if (!row) throw new Error('User not found')
  await auth.api.sendVerificationEmail({
    headers: getRequest().headers,
    body: { email: row.email, callbackURL: '/login' },
  })
  await writeAudit('user.resendVerification', 'user', userId)
  return { ok: true }
}
