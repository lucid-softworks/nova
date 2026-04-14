import { and, asc, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import type { PlatformKey } from '~/lib/platforms'

export type TemplateRow = {
  id: string
  name: string
  content: string
  platforms: PlatformKey[]
  createdAt: string
}

export type HashtagGroupRow = {
  id: string
  name: string
  hashtags: string[]
  createdAt: string
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

export async function listTemplatesImpl(slug: string): Promise<TemplateRow[]> {
  const { workspace } = await ensureWs(slug)
  const rows = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.workspaceId, workspace.id))
    .orderBy(asc(schema.templates.name))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    content: r.content,
    platforms: r.platforms as PlatformKey[],
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function createTemplateImpl(
  slug: string,
  input: { name: string; content: string; platforms: PlatformKey[] },
) {
  const { workspace } = await ensureWs(slug)
  const [row] = await db
    .insert(schema.templates)
    .values({
      workspaceId: workspace.id,
      name: input.name.trim(),
      content: input.content,
      platforms: input.platforms,
    })
    .returning()
  if (!row) throw new Error('Failed to create template')
  return row.id
}

export async function updateTemplateImpl(
  slug: string,
  templateId: string,
  input: { name: string; content: string; platforms: PlatformKey[] },
) {
  const { workspace } = await ensureWs(slug)
  await db
    .update(schema.templates)
    .set({ name: input.name.trim(), content: input.content, platforms: input.platforms })
    .where(
      and(
        eq(schema.templates.id, templateId),
        eq(schema.templates.workspaceId, workspace.id),
      ),
    )
  return { ok: true }
}

export async function deleteTemplateImpl(slug: string, templateId: string) {
  const { workspace } = await ensureWs(slug)
  await db
    .delete(schema.templates)
    .where(
      and(
        eq(schema.templates.id, templateId),
        eq(schema.templates.workspaceId, workspace.id),
      ),
    )
  return { ok: true }
}

// -- Hashtag groups ---------------------------------------------------------

export function normalizeHashtags(raw: string): string[] {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tokens) {
    const stripped = t.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')
    if (!stripped) continue
    const tag = `#${stripped}`
    if (seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    out.push(tag)
  }
  return out
}

export async function listHashtagGroupsImpl(slug: string): Promise<HashtagGroupRow[]> {
  const { workspace } = await ensureWs(slug)
  const rows = await db
    .select()
    .from(schema.hashtagGroups)
    .where(eq(schema.hashtagGroups.workspaceId, workspace.id))
    .orderBy(asc(schema.hashtagGroups.name))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    hashtags: r.hashtags,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function createHashtagGroupImpl(
  slug: string,
  input: { name: string; hashtags: string[] },
) {
  const { workspace } = await ensureWs(slug)
  const [row] = await db
    .insert(schema.hashtagGroups)
    .values({
      workspaceId: workspace.id,
      name: input.name.trim(),
      hashtags: input.hashtags,
    })
    .returning()
  if (!row) throw new Error('Failed to create group')
  return row.id
}

export async function updateHashtagGroupImpl(
  slug: string,
  groupId: string,
  input: { name: string; hashtags: string[] },
) {
  const { workspace } = await ensureWs(slug)
  await db
    .update(schema.hashtagGroups)
    .set({ name: input.name.trim(), hashtags: input.hashtags })
    .where(
      and(
        eq(schema.hashtagGroups.id, groupId),
        eq(schema.hashtagGroups.workspaceId, workspace.id),
      ),
    )
  return { ok: true }
}

export async function deleteHashtagGroupImpl(slug: string, groupId: string) {
  const { workspace } = await ensureWs(slug)
  await db
    .delete(schema.hashtagGroups)
    .where(
      and(
        eq(schema.hashtagGroups.id, groupId),
        eq(schema.hashtagGroups.workspaceId, workspace.id),
      ),
    )
  return { ok: true }
}
