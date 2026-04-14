import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import type { WorkspaceRole } from './types'

function isAdmin(role: WorkspaceRole): boolean {
  return role === 'admin'
}
function isAdminOrManager(role: WorkspaceRole): boolean {
  return role === 'admin' || role === 'manager'
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

// ---------- general -------------------------------------------------------

export type WorkspaceSettings = {
  id: string
  name: string
  slug: string
  timezone: string
  defaultLanguage: string
  logoUrl: string | null
  appName: string | null
  requireApproval: boolean
}

export async function getWorkspaceSettingsImpl(slug: string): Promise<WorkspaceSettings> {
  const { workspace } = await ensureWs(slug)
  const ws = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspace.id),
  })
  if (!ws) throw new Error('Workspace not found')
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    timezone: ws.timezone,
    defaultLanguage: ws.defaultLanguage,
    logoUrl: ws.logoUrl,
    appName: ws.appName,
    requireApproval: ws.requireApproval,
  }
}

export async function updateWorkspaceGeneralImpl(
  slug: string,
  patch: Partial<
    Pick<WorkspaceSettings, 'name' | 'slug' | 'timezone' | 'defaultLanguage' | 'logoUrl' | 'appName'>
  >,
): Promise<{ ok: true; newSlug: string }> {
  const { workspace } = await ensureWs(slug)
  if (!isAdmin(workspace.role)) throw new Error('Admins only')

  if (patch.slug) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(patch.slug)) {
      throw new Error('Slug must be lowercase letters, numbers, and hyphens')
    }
    const conflict = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.slug, patch.slug),
    })
    if (conflict && conflict.id !== workspace.id) {
      throw new Error('Slug is already taken')
    }
  }

  await db
    .update(schema.workspaces)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.defaultLanguage !== undefined ? { defaultLanguage: patch.defaultLanguage } : {}),
      ...(patch.logoUrl !== undefined ? { logoUrl: patch.logoUrl } : {}),
      ...(patch.appName !== undefined ? { appName: patch.appName } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.workspaces.id, workspace.id))

  return { ok: true, newSlug: patch.slug ?? workspace.slug }
}

export async function deleteWorkspaceImpl(slug: string, confirmName: string) {
  const { workspace } = await ensureWs(slug)
  if (!isAdmin(workspace.role)) throw new Error('Admins only')
  const ws = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspace.id),
  })
  if (!ws) throw new Error('Workspace not found')
  if (confirmName !== ws.name) throw new Error('Confirmation text does not match workspace name')
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspace.id))
  return { ok: true }
}

// ---------- posting schedule ----------------------------------------------

export type PostingSchedule = { dayOfWeek: number; times: string[] }

export async function getPostingScheduleImpl(slug: string): Promise<PostingSchedule[]> {
  const { workspace } = await ensureWs(slug)
  const rows = await db
    .select()
    .from(schema.postingSchedules)
    .where(eq(schema.postingSchedules.workspaceId, workspace.id))
  const byDay = new Map<number, string[]>()
  for (const r of rows) byDay.set(r.dayOfWeek, r.times)
  const out: PostingSchedule[] = []
  for (let d = 0; d < 7; d++) out.push({ dayOfWeek: d, times: byDay.get(d) ?? [] })
  return out
}

export async function setPostingScheduleImpl(slug: string, schedule: PostingSchedule[]) {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  // Normalize + validate
  const clean: PostingSchedule[] = []
  for (const s of schedule) {
    if (s.dayOfWeek < 0 || s.dayOfWeek > 6) throw new Error('Invalid day of week')
    const times = [...new Set(s.times)]
      .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
      .sort()
    clean.push({ dayOfWeek: s.dayOfWeek, times })
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.postingSchedules)
      .where(eq(schema.postingSchedules.workspaceId, workspace.id))
    for (const s of clean) {
      if (s.times.length > 0) {
        await tx.insert(schema.postingSchedules).values({
          workspaceId: workspace.id,
          dayOfWeek: s.dayOfWeek,
          times: s.times,
        })
      }
    }
  })
  return { ok: true }
}

// ---------- API keys ------------------------------------------------------

export type ApiKeyRow = {
  id: string
  name: string
  maskedKey: string
  lastUsedAt: string | null
  createdAt: string
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function generateApiKey(): string {
  const body = randomBytes(24).toString('hex')
  return `sk_${body}`
}

export async function listApiKeysImpl(slug: string): Promise<ApiKeyRow[]> {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  const rows = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.workspaceId, workspace.id))
    .orderBy(desc(schema.apiKeys.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    // We don't keep plaintext; show a generic masked placeholder suffixed with
    // the last 4 chars of the keyHash so users can distinguish multiple keys.
    maskedKey: `sk_••••••••••••••••${r.keyHash.slice(-4)}`,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function createApiKeyImpl(slug: string, name: string) {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  if (!name.trim()) throw new Error('Name is required')
  const plaintext = generateApiKey()
  const [row] = await db
    .insert(schema.apiKeys)
    .values({
      workspaceId: workspace.id,
      name: name.trim(),
      keyHash: sha256(plaintext),
    })
    .returning({ id: schema.apiKeys.id })
  if (!row) throw new Error('Failed to create key')
  return { id: row.id, plaintext }
}

export async function deleteApiKeyImpl(slug: string, keyId: string) {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  await db
    .delete(schema.apiKeys)
    .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.workspaceId, workspace.id)))
  return { ok: true }
}

// ---------- webhooks ------------------------------------------------------

export type WebhookRow = {
  id: string
  url: string
  events: string[]
  secret: string | null
  isActive: boolean
  createdAt: string
}

const ALLOWED_EVENTS = [
  'post.published',
  'post.failed',
  'post.scheduled',
  'post.approved',
  'post.rejected',
  'campaign.on_hold',
] as const

export async function listWebhooksImpl(slug: string): Promise<WebhookRow[]> {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  const rows = await db
    .select()
    .from(schema.webhooks)
    .where(eq(schema.webhooks.workspaceId, workspace.id))
    .orderBy(desc(schema.webhooks.createdAt))
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    events: r.events,
    // Don't return the secret after initial creation; frontends can't
    // display it anyway.
    secret: null,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function createWebhookImpl(slug: string, url: string, events: string[]) {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  if (!/^https:\/\//.test(url)) throw new Error('URL must use HTTPS')
  const invalid = events.filter(
    (e) => !(ALLOWED_EVENTS as readonly string[]).includes(e),
  )
  if (invalid.length > 0) throw new Error(`Unknown events: ${invalid.join(', ')}`)
  const secret = `whsec_${randomBytes(24).toString('hex')}`
  const [row] = await db
    .insert(schema.webhooks)
    .values({
      workspaceId: workspace.id,
      url,
      events,
      secret,
      isActive: true,
    })
    .returning({ id: schema.webhooks.id })
  if (!row) throw new Error('Failed to create webhook')
  return { id: row.id, secret }
}

export async function updateWebhookImpl(
  slug: string,
  webhookId: string,
  patch: { url?: string; events?: string[]; isActive?: boolean },
) {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  if (patch.url && !/^https:\/\//.test(patch.url)) throw new Error('URL must use HTTPS')
  await db
    .update(schema.webhooks)
    .set({
      ...(patch.url !== undefined ? { url: patch.url } : {}),
      ...(patch.events !== undefined ? { events: patch.events } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    })
    .where(
      and(eq(schema.webhooks.id, webhookId), eq(schema.webhooks.workspaceId, workspace.id)),
    )
  return { ok: true }
}

export async function deleteWebhookImpl(slug: string, webhookId: string) {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  await db
    .delete(schema.webhooks)
    .where(and(eq(schema.webhooks.id, webhookId), eq(schema.webhooks.workspaceId, workspace.id)))
  return { ok: true }
}
