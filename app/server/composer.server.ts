import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
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

export async function uploadMediaImpl(slug: string, file: File) {
  const { workspace, user } = await ensureWs(slug)
  const ext = path.extname(file.name) || ''
  const filename = `${randomUUID()}${ext}`
  const dir = storagePath()
  await mkdir(dir, { recursive: true })
  const abs = path.join(dir, filename)
  const buf = Buffer.from(await file.arrayBuffer())
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

    for (const version of input.versions) {
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
