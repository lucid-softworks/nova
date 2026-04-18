import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import { getStorage } from './storage'
import type { PlatformKey } from '~/lib/platforms'
import { logger } from '~/lib/logger'

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024 // 50 MB
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/']
const ALLOWED_MIME_EXACT = ['application/pdf']

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p)) || ALLOWED_MIME_EXACT.includes(mime)
}

export async function uploadMediaImpl(slug: string, file: File, folderId: string | null = null) {
  const { workspace, user } = await ensureWs(slug)

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error(`File too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is 50 MB.`)
  }
  const mime = file.type || 'application/octet-stream'
  if (!isAllowedMime(mime)) {
    throw new Error(`File type "${mime}" is not allowed. Upload images, videos, audio, or PDFs.`)
  }

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
      thumbnailUrl: existing.thumbnailUrl,
      width: existing.width,
      height: existing.height,
    }
  }

  const ext = path.extname(file.name) || ''
  const filename = `${randomUUID()}${ext}`
  const storage = getStorage()
  await storage.put(filename, buf, { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' })

  // Images: probe dimensions + generate a 320px max-edge webp thumbnail.
  // Videos: deferred (ffmpeg first-frame) — plan item calls it out.
  let width: number | null = null
  let height: number | null = null
  let thumbnailUrl: string | null = null
  if (mime.startsWith('image/')) {
    try {
      const { default: sharp } = await import('sharp')
      const meta = await sharp(buf).metadata()
      width = meta.width ?? null
      height = meta.height ?? null
      const thumbName = `${path.parse(filename).name}.thumb.webp`
      const thumbBuf = await sharp(buf)
        .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()
      await storage.put(thumbName, thumbBuf, {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
      })
      thumbnailUrl = storage.publicUrl(thumbName)
    } catch (e) {
      logger.warn({ err: e }, 'media thumbnail generation failed')
    }
  }

  const [row] = await db
    .insert(schema.mediaAssets)
    .values({
      workspaceId: workspace.id,
      uploadedById: user.id,
      filename,
      originalName: file.name,
      mimeType: mime,
      size: buf.length,
      url: storage.publicUrl(filename),
      width,
      height,
      thumbnailUrl,
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
    thumbnailUrl: row.thumbnailUrl,
    width: row.width,
    height: row.height,
  }
}

export type DraftVersionInput = {
  platforms: PlatformKey[]
  content: string
  firstComment: string | null
  isThread: boolean
  threadParts: { content: string; mediaIds: string[] }[]
  mediaIds: string[]
  altTextByMediaId?: Record<string, string>
  blueskyLabels?: string[]
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
  replyToPostId?: string | null
  quotePostId?: string | null
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
      const extras: Record<string, string> = {}
      if (version.isDefault) {
        Object.assign(extras, redditVars)
        if (input.replyToPostId) extras.replyToPostId = input.replyToPostId
        if (input.quotePostId) extras.quotePostId = input.quotePostId
      }
      if (version.blueskyLabels && version.blueskyLabels.length > 0) {
        extras.bluesky_labels = version.blueskyLabels.join(',')
      }
      const platformVariables = Object.keys(extras).length > 0 ? extras : {}
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
        const alt = version.altTextByMediaId?.[mid]?.trim() || null
        await tx.insert(schema.postMedia).values({
          postVersionId: v.id,
          mediaId: mid,
          sortOrder: i,
          altText: alt,
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
  width: number | null
  height: number | null
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
  altTextByMediaId: Record<string, string>
  blueskyLabels: string[]
  isDefault: boolean
}

export type LoadedPostPublishedLink = {
  socialAccountId: string
  publishedUrl: string
  platformPostId: string | null
}

export type LoadedPost = {
  id: string
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'pending_approval'
  scheduledAt: string | null
  publishedAt: string | null
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
  /** Populated once the post has landed on its platforms. */
  publishedLinks: LoadedPostPublishedLink[]
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

  const versionRows = await db
    .select()
    .from(schema.postVersions)
    .where(eq(schema.postVersions.postId, postId))

  const targets = await db
    .select({
      socialAccountId: schema.postPlatforms.socialAccountId,
      platformPostId: schema.postPlatforms.platformPostId,
      publishedUrl: schema.postPlatforms.publishedUrl,
    })
    .from(schema.postPlatforms)
    .where(eq(schema.postPlatforms.postId, postId))

  const publishedLinks: LoadedPostPublishedLink[] = targets
    .filter((t): t is typeof t & { publishedUrl: string } => !!t.publishedUrl)
    .map((t) => ({
      socialAccountId: t.socialAccountId,
      publishedUrl: t.publishedUrl,
      platformPostId: t.platformPostId,
    }))

  const mediaRows = await db
    .select({
      versionId: schema.postMedia.postVersionId,
      sortOrder: schema.postMedia.sortOrder,
      altText: schema.postMedia.altText,
      id: schema.mediaAssets.id,
      url: schema.mediaAssets.url,
      originalName: schema.mediaAssets.originalName,
      mimeType: schema.mediaAssets.mimeType,
      size: schema.mediaAssets.size,
      width: schema.mediaAssets.width,
      height: schema.mediaAssets.height,
    })
    .from(schema.postMedia)
    .innerJoin(schema.postVersions, eq(schema.postVersions.id, schema.postMedia.postVersionId))
    .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
    .where(inArray(schema.postVersions.id, versionRows.map((v) => v.id)))
    .orderBy(schema.postMedia.sortOrder)

  const mediaById: Record<string, LoadedPostMedia> = {}
  const mediaByVersion = new Map<string, string[]>()
  const altByVersion = new Map<string, Record<string, string>>()
  for (const m of mediaRows) {
    mediaById[m.id] = {
      id: m.id,
      url: m.url,
      originalName: m.originalName,
      mimeType: m.mimeType,
      size: m.size,
      width: m.width,
      height: m.height,
    }
    const arr = mediaByVersion.get(m.versionId) ?? []
    arr.push(m.id)
    mediaByVersion.set(m.versionId, arr)
    if (m.altText) {
      const alts = altByVersion.get(m.versionId) ?? {}
      alts[m.id] = m.altText
      altByVersion.set(m.versionId, alts)
    }
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
    altTextByMediaId: altByVersion.get(v.id) ?? {},
    blueskyLabels: (() => {
      const vars = (v.platformVariables as Record<string, string> | null) ?? {}
      const raw = vars.bluesky_labels ?? ''
      return raw ? raw.split(',').filter(Boolean) : []
    })(),
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
    publishedAt: post.publishedAt?.toISOString() ?? null,
    selectedAccountIds: targets.map((t) => t.socialAccountId),
    versions,
    mediaById,
    mode,
    reddit,
    publishedLinks,
  }
}
