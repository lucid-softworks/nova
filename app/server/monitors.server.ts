import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

export type KeywordWatchRow = {
  id: string
  term: string
  platform: string
  enabled: boolean
  createdAt: string
  lastCheckedAt: string | null
  matchCount: number
  unreadCount: number
}

export type KeywordMatchRow = {
  id: string
  watchId: string
  watchTerm: string
  authorHandle: string | null
  authorName: string | null
  authorAvatar: string | null
  content: string
  postUrl: string | null
  publishedAt: string | null
  seenAt: string
  read: boolean
}

export async function listWatchesImpl(slug: string): Promise<KeywordWatchRow[]> {
  const { workspace } = await ensureWs(slug)
  const watches = await db
    .select()
    .from(schema.keywordWatches)
    .where(eq(schema.keywordWatches.workspaceId, workspace.id))
    .orderBy(desc(schema.keywordWatches.createdAt))

  const matches = await db
    .select({
      watchId: schema.keywordMatches.watchId,
      read: schema.keywordMatches.readAt,
    })
    .from(schema.keywordMatches)
    .where(eq(schema.keywordMatches.workspaceId, workspace.id))

  const counts = new Map<string, { total: number; unread: number }>()
  for (const m of matches) {
    const c = counts.get(m.watchId) ?? { total: 0, unread: 0 }
    c.total++
    if (!m.read) c.unread++
    counts.set(m.watchId, c)
  }

  return watches.map((w) => {
    const c = counts.get(w.id) ?? { total: 0, unread: 0 }
    return {
      id: w.id,
      term: w.term,
      platform: w.platform,
      enabled: w.enabled,
      createdAt: w.createdAt.toISOString(),
      lastCheckedAt: w.lastCheckedAt ? w.lastCheckedAt.toISOString() : null,
      matchCount: c.total,
      unreadCount: c.unread,
    }
  })
}

export async function createWatchImpl(
  slug: string,
  term: string,
  platform: string,
): Promise<KeywordWatchRow> {
  const { workspace, user } = await ensureWs(slug)
  const trimmed = term.trim()
  if (!trimmed) throw new Error('Term is required')
  const [row] = await db
    .insert(schema.keywordWatches)
    .values({
      workspaceId: workspace.id,
      term: trimmed,
      platform,
      createdById: user.id,
    })
    .returning()
  if (!row) throw new Error('Failed to create watch')
  return {
    id: row.id,
    term: row.term,
    platform: row.platform,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    lastCheckedAt: null,
    matchCount: 0,
    unreadCount: 0,
  }
}

export async function toggleWatchImpl(slug: string, watchId: string, enabled: boolean) {
  const { workspace } = await ensureWs(slug)
  await db
    .update(schema.keywordWatches)
    .set({ enabled })
    .where(
      and(eq(schema.keywordWatches.id, watchId), eq(schema.keywordWatches.workspaceId, workspace.id)),
    )
  return { ok: true as const }
}

export async function deleteWatchImpl(slug: string, watchId: string) {
  const { workspace } = await ensureWs(slug)
  await db
    .delete(schema.keywordWatches)
    .where(
      and(eq(schema.keywordWatches.id, watchId), eq(schema.keywordWatches.workspaceId, workspace.id)),
    )
  return { ok: true as const }
}

export async function listMatchesImpl(
  slug: string,
  filters: { watchId?: string; unreadOnly?: boolean; limit?: number } = {},
): Promise<KeywordMatchRow[]> {
  const { workspace } = await ensureWs(slug)
  const conditions = [eq(schema.keywordMatches.workspaceId, workspace.id)]
  if (filters.watchId) conditions.push(eq(schema.keywordMatches.watchId, filters.watchId))
  if (filters.unreadOnly) conditions.push(isNull(schema.keywordMatches.readAt))

  const rows = await db
    .select({
      id: schema.keywordMatches.id,
      watchId: schema.keywordMatches.watchId,
      watchTerm: schema.keywordWatches.term,
      authorHandle: schema.keywordMatches.authorHandle,
      authorName: schema.keywordMatches.authorName,
      authorAvatar: schema.keywordMatches.authorAvatar,
      content: schema.keywordMatches.content,
      postUrl: schema.keywordMatches.postUrl,
      publishedAt: schema.keywordMatches.publishedAt,
      seenAt: schema.keywordMatches.seenAt,
      readAt: schema.keywordMatches.readAt,
    })
    .from(schema.keywordMatches)
    .innerJoin(
      schema.keywordWatches,
      eq(schema.keywordWatches.id, schema.keywordMatches.watchId),
    )
    .where(and(...conditions))
    .orderBy(desc(schema.keywordMatches.seenAt))
    .limit(filters.limit ?? 200)

  return rows.map((r) => ({
    id: r.id,
    watchId: r.watchId,
    watchTerm: r.watchTerm,
    authorHandle: r.authorHandle,
    authorName: r.authorName,
    authorAvatar: r.authorAvatar,
    content: r.content,
    postUrl: r.postUrl,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    seenAt: r.seenAt.toISOString(),
    read: !!r.readAt,
  }))
}

export async function markMatchReadImpl(slug: string, matchId: string) {
  const { workspace } = await ensureWs(slug)
  await db
    .update(schema.keywordMatches)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.keywordMatches.id, matchId),
        eq(schema.keywordMatches.workspaceId, workspace.id),
      ),
    )
  return { ok: true as const }
}

export async function markAllMatchesReadImpl(slug: string, watchId?: string) {
  const { workspace } = await ensureWs(slug)
  const conditions = [
    eq(schema.keywordMatches.workspaceId, workspace.id),
    isNull(schema.keywordMatches.readAt),
  ]
  if (watchId) conditions.push(eq(schema.keywordMatches.watchId, watchId))
  await db
    .update(schema.keywordMatches)
    .set({ readAt: new Date() })
    .where(and(...conditions))
  return { ok: true as const }
}
