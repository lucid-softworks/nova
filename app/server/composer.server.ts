import { mkdir, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import type { PlatformKey } from '~/lib/platforms'

function storagePath(): string {
  return process.env.STORAGE_LOCAL_PATH ?? './storage'
}

function publicUrlFor(filename: string): string {
  return `/media/${filename}`
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

export async function uploadMediaImpl(slug: string, file: File, folderId: string | null = null) {
  const { workspace, user } = await ensureWs(slug)

  if (folderId) {
    const parent = await db.query.mediaFolders.findFirst({
      where: and(
        eq(schema.mediaFolders.id, folderId),
        eq(schema.mediaFolders.workspaceId, workspace.id),
      ),
    })
    if (!parent) throw new Error('Destination folder not found')
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const contentHash = createHash('sha256').update(buf).digest('hex')

  // Dedup: if the same bytes already exist in this workspace, reuse that row.
  const existing = await db.query.mediaAssets.findFirst({
    where: and(
      eq(schema.mediaAssets.workspaceId, workspace.id),
      eq(schema.mediaAssets.contentHash, contentHash),
    ),
  })
  if (existing) {
    return {
      id: existing.id,
      filename: existing.filename,
      originalName: existing.originalName,
      mimeType: existing.mimeType,
      size: existing.size,
      url: existing.url,
    }
  }

  const ext = path.extname(file.name) || ''
  const filename = `${randomUUID()}${ext}`
  const dir = storagePath()
  await mkdir(dir, { recursive: true })
  const abs = path.join(dir, filename)
  await writeFile(abs, buf)

  const [row] = await db
    .insert(schema.mediaAssets)
    .values({
      workspaceId: workspace.id,
      uploadedById: user.id,
      filename,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: buf.length,
      url: publicUrlFor(filename),
      folderId,
      contentHash,
    })
    .returning()
  if (!row) throw new Error('Failed to record media')
  return {
    id: row.id,
    filename: row.filename,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    url: row.url,
  }
}

export type DraftVersionInput = {
  platforms: PlatformKey[]
  content: string
  firstComment: string | null
  isThread: boolean
  threadParts: { content: string; mediaIds: string[] }[]
  mediaIds: string[]
  isDefault: boolean
}

export type SaveDraftInput = {
  workspaceSlug: string
  postId?: string
  mode: 'shared' | 'independent'
  socialAccountIds: string[]
  versions: DraftVersionInput[]
  reddit?: {
    title: string
    subreddit: string
    postType: 'text' | 'link' | 'image' | 'video'
    nsfw: boolean
    spoiler: boolean
  } | null
}

export async function saveDraftImpl(input: SaveDraftInput) {
  const { workspace, user } = await ensureWs(input.workspaceSlug)

  // Validate selected accounts belong to the workspace
  if (input.socialAccountIds.length > 0) {
    const accounts = await db
      .select({ id: schema.socialAccounts.id })
      .from(schema.socialAccounts)
      .where(
        and(
          eq(schema.socialAccounts.workspaceId, workspace.id),
          inArray(schema.socialAccounts.id, input.socialAccountIds),
        ),
      )
    if (accounts.length !== input.socialAccountIds.length) {
      throw new Error('One or more accounts not found in this workspace')
    }
  }

  const result = await db.transaction(async (tx) => {
    let postId = input.postId
    if (postId) {
      const existing = await tx
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(and(eq(schema.posts.id, postId), eq(schema.posts.workspaceId, workspace.id)))
        .limit(1)
      if (!existing[0]) throw new Error('Post not found')
      await tx
        .update(schema.posts)
        .set({ updatedAt: new Date(), status: 'draft' })
        .where(eq(schema.posts.id, postId))
      await tx.delete(schema.postVersions).where(eq(schema.postVersions.postId, postId))
      await tx.delete(schema.postPlatforms).where(eq(schema.postPlatforms.postId, postId))
    } else {
      const [row] = await tx
        .insert(schema.posts)
        .values({
          workspaceId: workspace.id,
          authorId: user.id,
          type: 'original',
          status: 'draft',
        })
        .returning({ id: schema.posts.id })
      postId = row!.id
    }

    // Fold Reddit per-post fields onto the default version's
    // platformVariables so round-trips + the publisher can read them.
    const redditVars: Record<string, string> = input.reddit
      ? {
          reddit_title: input.reddit.title,
          reddit_subreddit: input.reddit.subreddit,
          reddit_post_type: input.reddit.postType,
          reddit_nsfw: input.reddit.nsfw ? 'true' : 'false',
          reddit_spoiler: input.reddit.spoiler ? 'true' : 'false',
        }
      : {}

    for (const version of input.versions) {
      const platformVariables =
        version.isDefault && Object.keys(redditVars).length > 0 ? redditVars : {}
      const [v] = await tx
        .insert(schema.postVersions)
        .values({
          postId,
          platforms: version.platforms,
          content: version.content,
          firstComment: version.firstComment,
          isThread: version.isThread,
          threadParts: version.threadParts,
          isDefault: version.isDefault,
          platformVariables,
        })
        .returning({ id: schema.postVersions.id })
      if (!v) throw new Error('Failed to create version')
      for (let i = 0; i < version.mediaIds.length; i++) {
        const mid = version.mediaIds[i]
        if (!mid) continue
        await tx.insert(schema.postMedia).values({
          postVersionId: v.id,
          mediaId: mid,
          sortOrder: i,
        })
      }
    }

    for (const sid of input.socialAccountIds) {
      await tx.insert(schema.postPlatforms).values({
        postId,
        socialAccountId: sid,
        status: 'pending',
      })
    }

    await tx.insert(schema.postActivity).values({
      postId,
      userId: user.id,
      action: input.postId ? 'edited' : 'created',
    })

    return { postId }
  })

  return result
}

// ---------- Edit-existing loader -----------------------------------------

export type LoadedPostMedia = {
  id: string
  url: string
  originalName: string
  mimeType: string
  size: number
}

export type LoadedPostVersion = {
  id: string
  platforms: PlatformKey[]
  content: string
  firstComment: string | null
  firstCommentEnabled: boolean
  isThread: boolean
  threadParts: { content: string; mediaIds: string[] }[]
  mediaIds: string[]
  isDefault: boolean
}

export type LoadedPost = {
  id: string
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'pending_approval'
  scheduledAt: string | null
  selectedAccountIds: string[]
  versions: LoadedPostVersion[]
  mediaById: Record<string, LoadedPostMedia>
  mode: 'shared' | 'independent'
  reddit: {
    title: string
    subreddit: string
    postType: 'text' | 'link' | 'image' | 'video'
    nsfw: boolean
    spoiler: boolean
  } | null
}

export async function loadPostForComposerImpl(
  slug: string,
  postId: string,
): Promise<LoadedPost> {
  const { workspace } = await ensureWs(slug)
  const post = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.workspaceId, workspace.id)),
  })
  if (!post) throw new Error('Post not found')
  if (post.status === 'published') {
    throw new Error('Published posts cannot be edited')
  }

  const versionRows = await db
    .select()
    .from(schema.postVersions)
    .where(eq(schema.postVersions.postId, postId))

  const targets = await db
    .select({ socialAccountId: schema.postPlatforms.socialAccountId })
    .from(schema.postPlatforms)
    .where(eq(schema.postPlatforms.postId, postId))

  const mediaRows = await db
    .select({
      versionId: schema.postMedia.postVersionId,
      sortOrder: schema.postMedia.sortOrder,
      id: schema.mediaAssets.id,
      url: schema.mediaAssets.url,
      originalName: schema.mediaAssets.originalName,
      mimeType: schema.mediaAssets.mimeType,
      size: schema.mediaAssets.size,
    })
    .from(schema.postMedia)
    .innerJoin(schema.postVersions, eq(schema.postVersions.id, schema.postMedia.postVersionId))
    .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
    .where(inArray(schema.postVersions.id, versionRows.map((v) => v.id)))
    .orderBy(schema.postMedia.sortOrder)

  const mediaById: Record<string, LoadedPostMedia> = {}
  const mediaByVersion = new Map<string, string[]>()
  for (const m of mediaRows) {
    mediaById[m.id] = {
      id: m.id,
      url: m.url,
      originalName: m.originalName,
      mimeType: m.mimeType,
      size: m.size,
    }
    const arr = mediaByVersion.get(m.versionId) ?? []
    arr.push(m.id)
    mediaByVersion.set(m.versionId, arr)
  }

  // Decide mode: if any non-default version exists and covers a single
  // platform, treat as independent; otherwise shared. Good heuristic for
  // the common case.
  const nonDefault = versionRows.filter((v) => !v.isDefault)
  const mode: 'shared' | 'independent' =
    nonDefault.length > 0 && nonDefault.every((v) => (v.platforms as string[]).length === 1)
      ? 'independent'
      : 'shared'

  const versions: LoadedPostVersion[] = versionRows.map((v) => ({
    id: v.id,
    platforms: (v.platforms as PlatformKey[]) ?? [],
    content: v.content,
    firstComment: v.firstComment,
    firstCommentEnabled: !!v.firstComment,
    isThread: v.isThread,
    threadParts: ((v.threadParts as { content: string; mediaIds: string[] }[]) ?? []).map((p) => ({
      content: p.content,
      mediaIds: p.mediaIds ?? [],
    })),
    mediaIds: mediaByVersion.get(v.id) ?? [],
    isDefault: v.isDefault,
  }))

  // Pull Reddit per-post fields off the default version's platformVariables.
  const defaultVersionRow = versionRows.find((v) => v.isDefault)
  const vars = (defaultVersionRow?.platformVariables as Record<string, string> | null) ?? {}
  const redditTitle = vars.reddit_title
  const postType: 'text' | 'link' | 'image' | 'video' =
    vars.reddit_post_type === 'link' ||
    vars.reddit_post_type === 'image' ||
    vars.reddit_post_type === 'video'
      ? vars.reddit_post_type
      : 'text'
  const reddit =
    redditTitle !== undefined || vars.reddit_subreddit
      ? {
          title: vars.reddit_title ?? '',
          subreddit: vars.reddit_subreddit ?? '',
          postType,
          nsfw: vars.reddit_nsfw === 'true',
          spoiler: vars.reddit_spoiler === 'true',
        }
      : null

  return {
    id: post.id,
    status: post.status,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    selectedAccountIds: targets.map((t) => t.socialAccountId),
    versions,
    mediaById,
    mode,
    reddit,
  }
}
