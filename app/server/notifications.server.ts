import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from './db'
import { loadSessionContext } from './session.server'
import { sendEmail } from './mailer.server'
import { decrypt } from '~/lib/encryption'
import { logger } from '~/lib/logger'

export type NotificationType =
  | 'post_published'
  | 'post_failed'
  | 'approval_requested'
  | 'post_approved'
  | 'post_rejected'
  | 'member_joined'
  | 'campaign_on_hold'
  | 'post_note_mention'

export type ChannelPrefs = { inApp: boolean; email: boolean; push: boolean }
export type NotificationPreferences = Partial<Record<NotificationType, ChannelPrefs>>

const DEFAULT_PREFS: Record<NotificationType, ChannelPrefs> = {
  post_published: { inApp: true, email: false, push: false },
  post_failed: { inApp: true, email: true, push: true },
  approval_requested: { inApp: true, email: true, push: true },
  post_approved: { inApp: true, email: true, push: false },
  post_rejected: { inApp: true, email: true, push: false },
  member_joined: { inApp: true, email: false, push: false },
  campaign_on_hold: { inApp: true, email: true, push: true },
  post_note_mention: { inApp: true, email: true, push: true },
}

function resolvePrefs(raw: unknown, type: NotificationType): ChannelPrefs {
  const prefs = (raw ?? {}) as NotificationPreferences
  return { ...DEFAULT_PREFS[type], ...(prefs[type] ?? {}) }
}

export type NotificationData = Record<string, string | number | boolean | null>

export type NotificationRow = {
  id: string
  type: NotificationType
  title: string
  body: string
  data: NotificationData
  readAt: string | null
  createdAt: string
  workspaceSlug: string | null
}

async function requireUser() {
  const ctx = await loadSessionContext()
  if (!ctx.user) throw new Error('unauthenticated')
  const user = ctx.user
  return { ...ctx, user }
}

export async function listMyNotificationsImpl(): Promise<NotificationRow[]> {
  const { user } = await requireUser()
  const rows = await db
    .select({
      id: schema.notifications.id,
      type: schema.notifications.type,
      title: schema.notifications.title,
      body: schema.notifications.body,
      data: schema.notifications.data,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
      slug: schema.organization.slug,
    })
    .from(schema.notifications)
    .leftJoin(schema.workspaces, eq(schema.workspaces.id, schema.notifications.workspaceId))
    .leftJoin(schema.organization, eq(schema.organization.id, schema.workspaces.organizationId))
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50)

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    data: (r.data ?? {}) as NotificationData,
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    workspaceSlug: r.slug,
  }))
}

export async function unreadCountImpl(): Promise<number> {
  const { user } = await requireUser()
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(
      and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)),
    )
  return rows[0]?.n ?? 0
}

export async function markReadImpl(ids: string[]) {
  if (ids.length === 0) return { ok: true }
  const { user } = await requireUser()
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, user.id),
        inArray(schema.notifications.id, ids),
      ),
    )
  return { ok: true }
}

export async function markAllReadImpl() {
  const { user } = await requireUser()
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)),
    )
  return { ok: true }
}

// -- Emission helpers (callable from other server code) -------------------

export async function notifyUser(params: {
  userId: string
  workspaceId: string
  type: NotificationType
  title: string
  body: string
  data?: NotificationData
}) {
  // Load user + prefs + push target + workspace brand (for email footer)
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, params.userId) })
  if (!u) return
  const prefs = resolvePrefs(u.notificationPreferences, params.type)
  const wsRow = await db
    .select({
      appName: schema.workspaces.appName,
      orgSlug: schema.organization.slug,
      orgLogo: schema.organization.logo,
    })
    .from(schema.workspaces)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.workspaces.organizationId))
    .where(eq(schema.workspaces.id, params.workspaceId))
    .limit(1)
  const ws = wsRow[0] ?? null
  const appName = ws?.appName ?? 'Nova'
  const deepUrl = buildDeepLink(ws?.orgSlug ?? null, params.type, params.data ?? {})

  const jobs: Array<Promise<unknown>> = []

  if (prefs.inApp) {
    jobs.push(
      db.insert(schema.notifications).values({
        userId: params.userId,
        workspaceId: params.workspaceId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data ?? {},
      }),
    )
  }

  if (prefs.email && u.email) {
    jobs.push(
      sendEmail({
        to: u.email,
        subject: `[${appName}] ${params.title}`,
        text: `${params.body}${deepUrl ? `\n\n${deepUrl}` : ''}`,
        html: renderEmail({
          appName,
          logoUrl: ws?.orgLogo ?? null,
          title: params.title,
          body: params.body,
          deepUrl,
        }),
      }).catch((err) => logger.error({ err }, 'notify:email send failed')),
    )
  }

  if (prefs.push && u.brrrWebhookSecret) {
    jobs.push(
      sendBrrrPush({
        secret: u.brrrWebhookSecret,
        title: params.title,
        message: params.body,
        openUrl: deepUrl,
      }).catch((err) => logger.error({ err }, 'notify:push send failed')),
    )
  }

  await Promise.allSettled(jobs)
}

function buildDeepLink(
  slug: string | null,
  type: NotificationType,
  data: NotificationData,
): string | null {
  if (!slug) return null
  const base = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  if (type === 'campaign_on_hold' && typeof data.campaignId === 'string') {
    return `${base}/${slug}/posts/campaigns/${data.campaignId}`
  }
  if (typeof data.postId === 'string') return `${base}/${slug}/posts`
  return `${base}/${slug}/compose`
}

function renderEmail(p: {
  appName: string
  logoUrl: string | null
  title: string
  body: string
  deepUrl: string | null
}): string {
  const { appName, logoUrl, title, body, deepUrl } = p
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
    )
  return `
  <div style="font-family:system-ui;max-width:520px;margin:24px auto;color:#111">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      ${
        logoUrl
          ? `<img src="${esc(logoUrl)}" alt="" width="28" height="28" style="border-radius:4px" />`
          : ''
      }
      <strong style="font-size:14px">${esc(appName)}</strong>
    </div>
    <h2 style="margin:0 0 8px;font-size:18px">${esc(title)}</h2>
    <p style="color:#333;line-height:1.5;white-space:pre-wrap;margin:0 0 16px">${esc(body)}</p>
    ${
      deepUrl
        ? `<p style="margin:20px 0"><a href="${esc(deepUrl)}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open</a></p>`
        : ''
    }
    <p style="color:#999;font-size:11px;margin-top:24px">
      You can change how you receive notifications in Settings → Notifications.
    </p>
  </div>`
}

async function sendBrrrPush(opts: {
  secret: string
  title: string
  message: string
  openUrl: string | null
}) {
  let plaintext = opts.secret
  try {
    plaintext = decrypt(opts.secret)
  } catch {
    // Secret wasn't encrypted (legacy or test fixture) — use as-is.
  }
  const body: Record<string, unknown> = {
    title: opts.title,
    message: opts.message,
  }
  if (opts.openUrl) body.open_url = opts.openUrl
  const res = await fetch(`https://api.brrr.now/v1/${encodeURIComponent(plaintext)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`brrr.now ${res.status}: ${txt.slice(0, 200)}`)
  }
}

export async function notifyWorkspaceAdmins(params: {
  workspaceId: string
  type: NotificationType
  title: string
  body: string
  data?: NotificationData
}) {
  const members = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.organizationId, schema.member.organizationId),
    )
    .where(
      and(eq(schema.workspaces.id, params.workspaceId), eq(schema.member.role, 'admin')),
    )
  for (const m of members) {
    await notifyUser({ ...params, userId: m.userId })
  }
}

export async function notifyWorkspaceApprovers(params: {
  workspaceId: string
  type: NotificationType
  title: string
  body: string
  data?: NotificationData
}) {
  const approvers = await db
    .select({ userId: schema.workspaceApprovers.userId })
    .from(schema.workspaceApprovers)
    .where(eq(schema.workspaceApprovers.workspaceId, params.workspaceId))
  for (const a of approvers) {
    await notifyUser({ ...params, userId: a.userId })
  }
}
