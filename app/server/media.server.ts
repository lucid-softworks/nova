import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { and, asc, desc, eq, inArray, like, or } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'

export type FolderNode = {
  id: string
  name: string
  parentId: string | null
}

export type MediaKind = 'image' | 'video' | 'gif' | 'other'

export type AssetSummary = {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  url: string
  thumbnailUrl: string | null
  width: number | null
  height: number | null
  duration: number | null
  folderId: string | null
  createdAt: string
  uploaderName: string | null
  kind: MediaKind
}

export type AssetListQuery = {
  workspaceSlug: string
  folderId: string | null
  search: string | null
  filter: 'all' | 'image' | 'video' | 'gif'
  sort: 'date_desc' | 'date_asc' | 'name' | 'size'
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

export function kindOf(mime: string, originalName: string): MediaKind {
  if (mime === 'image/gif' || originalName.toLowerCase().endsWith('.gif')) return 'gif'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'other'
}

export async function listFoldersImpl(slug: string): Promise<FolderNode[]> {
  const { workspace } = await ensureWs(slug)
  const rows = await db
    .select({
      id: schema.mediaFolders.id,
      name: schema.mediaFolders.name,
      parentId: schema.mediaFolders.parentId,
    })
    .from(schema.mediaFolders)
    .where(eq(schema.mediaFolders.workspaceId, workspace.id))
    .orderBy(asc(schema.mediaFolders.name))
  return rows
}

export async function createFolderImpl(slug: string, name: string, parentId: string | null) {
  const { workspace } = await ensureWs(slug)
  if (!name.trim()) throw new Error('Folder name required')
  if (parentId) {
    const parent = await db.query.mediaFolders.findFirst({
      where: and(
        eq(schema.mediaFolders.id, parentId),
        eq(schema.mediaFolders.workspaceId, workspace.id),
      ),
    })
    if (!parent) throw new Error('Parent folder not found')
  }
  const [row] = await db
    .insert(schema.mediaFolders)
    .values({ workspaceId: workspace.id, name: name.trim(), parentId })
    .returning()
  return row!
}

export async function renameFolderImpl(slug: string, folderId: string, name: string) {
  const { workspace } = await ensureWs(slug)
  if (!name.trim()) throw new Error('Folder name required')
  await db
    .update(schema.mediaFolders)
    .set({ name: name.trim() })
    .where(
      and(
        eq(schema.mediaFolders.id, folderId),
        eq(schema.mediaFolders.workspaceId, workspace.id),
      ),
    )
  return { ok: true }
}

export async function deleteFolderImpl(slug: string, folderId: string) {
  const { workspace } = await ensureWs(slug)
  // Collect descendants recursively
  const all = await db
    .select()
    .from(schema.mediaFolders)
    .where(eq(schema.mediaFolders.workspaceId, workspace.id))
  const ids = new Set<string>([folderId])
  const walk = (parent: string) => {
    for (const f of all) {
      if (f.parentId === parent && !ids.has(f.id)) {
        ids.add(f.id)
        walk(f.id)
      }
    }
  }
  walk(folderId)
  // Null out folderId on assets in those folders, then delete the folders.
  await db
    .update(schema.mediaAssets)
    .set({ folderId: null })
    .where(
      and(
        eq(schema.mediaAssets.workspaceId, workspace.id),
        inArray(schema.mediaAssets.folderId, [...ids]),
      ),
    )
  await db
    .delete(schema.mediaFolders)
    .where(
      and(
        eq(schema.mediaFolders.workspaceId, workspace.id),
        inArray(schema.mediaFolders.id, [...ids]),
      ),
    )
  return { ok: true }
}

export async function listAssetsImpl(q: AssetListQuery): Promise<AssetSummary[]> {
  const { workspace } = await ensureWs(q.workspaceSlug)
  const wsFilter = eq(schema.mediaAssets.workspaceId, workspace.id)
  const folderFilter =
    q.folderId === null
      ? undefined
      : q.folderId === 'uncategorized'
        ? and(wsFilter, eq(schema.mediaAssets.folderId, null as unknown as string))
        : eq(schema.mediaAssets.folderId, q.folderId)
  const searchFilter = q.search
    ? or(
        like(schema.mediaAssets.originalName, `%${q.search}%`),
        like(schema.mediaAssets.filename, `%${q.search}%`),
      )
    : undefined

  let filterFilter
  if (q.filter === 'image')
    filterFilter = and(
      like(schema.mediaAssets.mimeType, 'image/%'),
      // Exclude gif from image bucket
      // (drizzle doesn't have notLike in this import; ILIKE negation via raw SQL is overkill here)
    )
  else if (q.filter === 'video') filterFilter = like(schema.mediaAssets.mimeType, 'video/%')
  else if (q.filter === 'gif') filterFilter = eq(schema.mediaAssets.mimeType, 'image/gif')

  const where = and(wsFilter, folderFilter, searchFilter, filterFilter)
  const orderBy =
    q.sort === 'date_desc'
      ? desc(schema.mediaAssets.createdAt)
      : q.sort === 'date_asc'
        ? asc(schema.mediaAssets.createdAt)
        : q.sort === 'name'
          ? asc(schema.mediaAssets.originalName)
          : asc(schema.mediaAssets.size)

  const rows = await db
    .select({
      id: schema.mediaAssets.id,
      filename: schema.mediaAssets.filename,
      originalName: schema.mediaAssets.originalName,
      mimeType: schema.mediaAssets.mimeType,
      size: schema.mediaAssets.size,
      url: schema.mediaAssets.url,
      thumbnailUrl: schema.mediaAssets.thumbnailUrl,
      width: schema.mediaAssets.width,
      height: schema.mediaAssets.height,
      duration: schema.mediaAssets.duration,
      folderId: schema.mediaAssets.folderId,
      createdAt: schema.mediaAssets.createdAt,
      uploaderName: schema.user.name,
    })
    .from(schema.mediaAssets)
    .leftJoin(schema.user, eq(schema.user.id, schema.mediaAssets.uploadedById))
    .where(where)
    .orderBy(orderBy)

  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    originalName: r.originalName,
    mimeType: r.mimeType,
    size: r.size,
    url: r.url,
    thumbnailUrl: r.thumbnailUrl,
    width: r.width,
    height: r.height,
    duration: r.duration,
    folderId: r.folderId,
    createdAt: r.createdAt.toISOString(),
    uploaderName: r.uploaderName,
    kind: kindOf(r.mimeType, r.originalName),
  }))
}

export async function moveAssetsImpl(slug: string, assetIds: string[], folderId: string | null) {
  const { workspace } = await ensureWs(slug)
  if (assetIds.length === 0) return { ok: true }
  if (folderId) {
    const parent = await db.query.mediaFolders.findFirst({
      where: and(
        eq(schema.mediaFolders.id, folderId),
        eq(schema.mediaFolders.workspaceId, workspace.id),
      ),
    })
    if (!parent) throw new Error('Destination folder not found')
  }
  await db
    .update(schema.mediaAssets)
    .set({ folderId })
    .where(
      and(
        eq(schema.mediaAssets.workspaceId, workspace.id),
        inArray(schema.mediaAssets.id, assetIds),
      ),
    )
  return { ok: true }
}

export async function deleteAssetsImpl(slug: string, assetIds: string[]) {
  const { workspace } = await ensureWs(slug)
  if (assetIds.length === 0) return { ok: true }

  const rows = await db
    .select({
      id: schema.mediaAssets.id,
      filename: schema.mediaAssets.filename,
      contentHash: schema.mediaAssets.contentHash,
    })
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.workspaceId, workspace.id),
        inArray(schema.mediaAssets.id, assetIds),
      ),
    )

  await db
    .delete(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.workspaceId, workspace.id),
        inArray(schema.mediaAssets.id, assetIds),
      ),
    )

  // Only unlink the file if no other row in this workspace still references
  // the same contentHash. Rows without a hash fall back to filename
  // uniqueness and can be unlinked directly.
  const dir = process.env.STORAGE_LOCAL_PATH ?? './storage'
  for (const r of rows) {
    if (r.contentHash) {
      const stillReferenced = await db.query.mediaAssets.findFirst({
        where: and(
          eq(schema.mediaAssets.workspaceId, workspace.id),
          eq(schema.mediaAssets.contentHash, r.contentHash),
        ),
      })
      if (stillReferenced) continue
    }
    await unlink(path.join(dir, r.filename)).catch(() => {})
  }
  return { ok: true }
}
