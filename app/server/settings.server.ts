import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '~/lib/auth'
import { decrypt, encrypt } from '~/lib/encryption'
import { isProviderId, PROVIDERS, type ProviderId } from '~/lib/ai/providers'
import { db, schema } from './db'
import { requireWorkspaceAccess, requireWorkspaceDetail } from './session.server'
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
  const r = await requireWorkspaceDetail(slug)
  if (!r.ok) throw new Error(r.reason)
  const d = r.detail
  return {
    id: d.workspaceId,
    name: d.orgName,
    slug: d.orgSlug,
    timezone: d.timezone,
    defaultLanguage: d.defaultLanguage,
    logoUrl: d.orgLogo,
    appName: d.appName,
    requireApproval: d.requireApproval,
  }
}

export async function updateWorkspaceGeneralImpl(
  slug: string,
  patch: Partial<
    Pick<WorkspaceSettings, 'name' | 'slug' | 'timezone' | 'defaultLanguage' | 'logoUrl' | 'appName'>
  >,
): Promise<{ ok: true; newSlug: string }> {
  const r = await requireWorkspaceDetail(slug)
  if (!r.ok) throw new Error(r.reason)
  if (!isAdmin(r.detail.role)) throw new Error('Admins only')

  if (patch.slug) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(patch.slug)) {
      throw new Error('Slug must be lowercase letters, numbers, and hyphens')
    }
    const conflict = await db.query.organization.findFirst({
      where: eq(schema.organization.slug, patch.slug),
    })
    if (conflict && conflict.id !== r.detail.organizationId) {
      throw new Error('Slug is already taken')
    }
  }

  // Identity (name/slug/logo) lives on organization; domain fields on the
  // satellite workspaces row.
  if (patch.name !== undefined || patch.slug !== undefined || patch.logoUrl !== undefined) {
    await db
      .update(schema.organization)
      .set({
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.logoUrl !== undefined ? { logo: patch.logoUrl } : {}),
      })
      .where(eq(schema.organization.id, r.detail.organizationId))
  }
  if (
    patch.timezone !== undefined ||
    patch.defaultLanguage !== undefined ||
    patch.appName !== undefined
  ) {
    await db
      .update(schema.workspaces)
      .set({
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.defaultLanguage !== undefined ? { defaultLanguage: patch.defaultLanguage } : {}),
        ...(patch.appName !== undefined ? { appName: patch.appName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.workspaces.id, r.detail.workspaceId))
  }

  return { ok: true, newSlug: patch.slug ?? r.detail.orgSlug }
}

export async function deleteWorkspaceImpl(slug: string, confirmName: string) {
  const r = await requireWorkspaceDetail(slug)
  if (!r.ok) throw new Error(r.reason)
  if (!isAdmin(r.detail.role)) throw new Error('Admins only')
  if (confirmName !== r.detail.orgName) {
    throw new Error('Confirmation text does not match workspace name')
  }
  // Cascades through workspaces (FK cascade) + member + invitation.
  await db.delete(schema.organization).where(eq(schema.organization.id, r.detail.organizationId))
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
// Delegated to the Better Auth @better-auth/api-key plugin. Keys are bound
// to the calling user (not the workspace) — workspace scoping flows from
// the user's membership at request time.

export type ApiKeyRow = {
  id: string
  name: string
  maskedKey: string
  lastUsedAt: string | null
  createdAt: string
}

function authHeaders() {
  return getRequest().headers
}

type BetterAuthKey = {
  id: string
  name?: string | null
  start?: string | null
  prefix?: string | null
  lastRequest?: string | Date | null
  createdAt: string | Date
}

export async function listApiKeysImpl(slug: string): Promise<ApiKeyRow[]> {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  const result = (await auth.api.listApiKeys({ headers: authHeaders() })) as
    | BetterAuthKey[]
    | { apiKeys: BetterAuthKey[] }
  const rows: BetterAuthKey[] = Array.isArray(result) ? result : result.apiKeys
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? 'Unnamed key',
    maskedKey: `${r.prefix ?? 'sk_'}••••••••••••••••${r.start ?? ''}`,
    lastUsedAt: r.lastRequest ? new Date(r.lastRequest).toISOString() : null,
    createdAt: new Date(r.createdAt).toISOString(),
  }))
}

export async function createApiKeyImpl(slug: string, name: string) {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  if (!name.trim()) throw new Error('Name is required')
  const result = (await auth.api.createApiKey({
    headers: authHeaders(),
    body: { name: name.trim() },
  })) as { id: string; key: string }
  return { id: result.id, plaintext: result.key }
}

export async function deleteApiKeyImpl(slug: string, keyId: string) {
  const { workspace } = await ensureWs(slug)
  if (!isAdminOrManager(workspace.role)) throw new Error('Insufficient permission')
  await auth.api.deleteApiKey({ headers: authHeaders(), body: { keyId } })
  return { ok: true }
}

// Silence unused-import warnings for pieces that older impls relied on.
void and
void desc
void randomBytes

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

// ---------- Workspace BYO AI keys ----------------------------------------

export type WorkspaceAiProviderConfig = {
  id: ProviderId
  label: string
  keySet: boolean
  /** Last 4 chars of the key — never the full value. */
  keyHint: string | null
  model: string | null
  defaultModel: string
  baseURL: string | null
  defaultBaseURL: string | null
  requiresUserModel: boolean
  requiresUserBaseURL: boolean
  signupUrl: string | null
}

export type WorkspaceAiKeys = {
  active: ProviderId
  providers: WorkspaceAiProviderConfig[]
}

export async function getWorkspaceAiKeysImpl(slug: string): Promise<WorkspaceAiKeys> {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  const ws = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, r.workspace.id),
    columns: { aiProvider: true, aiConfig: true },
  })
  const activeRaw = ws?.aiProvider ?? 'anthropic'
  const active: ProviderId = isProviderId(activeRaw) ? activeRaw : 'anthropic'
  const cfgMap = ws?.aiConfig ?? {}
  const providers: WorkspaceAiProviderConfig[] = Object.values(PROVIDERS).map((p) => {
    const cfg = cfgMap[p.id]
    const encrypted = cfg?.key ?? null
    let keyHint: string | null = null
    if (encrypted) {
      try {
        const plain = decrypt(encrypted)
        keyHint = plain ? `••••${plain.slice(-4)}` : null
      } catch {
        keyHint = null
      }
    }
    return {
      id: p.id,
      label: p.label,
      keySet: !!encrypted,
      keyHint,
      model: cfg?.model ?? null,
      defaultModel: p.defaultModel,
      baseURL: cfg?.baseURL ?? null,
      defaultBaseURL: p.baseURL ?? null,
      requiresUserModel: !!p.requiresUserModel,
      requiresUserBaseURL: !!p.requiresUserBaseURL,
      signupUrl: p.signupUrl ?? null,
    }
  })
  return { active, providers }
}

export async function setWorkspaceAiProviderImpl(
  slug: string,
  providerId: string,
): Promise<{ ok: true }> {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  if (r.workspace.role !== 'admin' && r.workspace.role !== 'manager') {
    throw new Error('Only admins or managers can manage AI keys')
  }
  if (!isProviderId(providerId)) throw new Error('Unknown provider')
  await db
    .update(schema.workspaces)
    .set({ aiProvider: providerId, updatedAt: new Date() })
    .where(eq(schema.workspaces.id, r.workspace.id))
  return { ok: true }
}

export type WorkspaceAiProviderPatch = {
  /** When null, clears the key. When undefined, leaves it unchanged. */
  key?: string | null
  model?: string | null
  baseURL?: string | null
}

export async function updateWorkspaceAiProviderImpl(
  slug: string,
  providerId: string,
  patch: WorkspaceAiProviderPatch,
): Promise<{ ok: true }> {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  if (r.workspace.role !== 'admin' && r.workspace.role !== 'manager') {
    throw new Error('Only admins or managers can manage AI keys')
  }
  if (!isProviderId(providerId)) throw new Error('Unknown provider')

  const ws = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, r.workspace.id),
    columns: { aiConfig: true },
  })
  const next: Record<string, { key?: string; model?: string | null; baseURL?: string | null }> = {
    ...(ws?.aiConfig ?? {}),
  }
  const prev = next[providerId] ?? {}
  const merged: { key?: string; model?: string | null; baseURL?: string | null } = { ...prev }
  if (patch.key !== undefined) {
    const trimmed = patch.key?.trim() ?? ''
    if (trimmed === '') delete merged.key
    else merged.key = encrypt(trimmed)
  }
  if (patch.model !== undefined) {
    const m = patch.model?.trim() ?? ''
    merged.model = m === '' ? null : m
  }
  if (patch.baseURL !== undefined) {
    const b = patch.baseURL?.trim() ?? ''
    merged.baseURL = b === '' ? null : b
  }
  if (!merged.key && !merged.model && !merged.baseURL) {
    delete next[providerId]
  } else {
    next[providerId] = merged
  }
  await db
    .update(schema.workspaces)
    .set({ aiConfig: next, updatedAt: new Date() })
    .where(eq(schema.workspaces.id, r.workspace.id))
  return { ok: true }
}
