import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'

export type BioPageRow = {
  id: string
  handle: string
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  theme: string
  links: Array<{ title: string; url: string }>
  showRecentPosts: boolean
  recentPostCount: number
  createdAt: string
}

export type PublicBioPage = BioPageRow & {
  recentPosts: Array<{
    id: string
    content: string
    publishedAt: string
    platforms: string[]
  }>
}

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

const wsInput = z.object({ workspaceSlug: z.string().min(1) })

export const getBioPage = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsInput.parse(d))
  .handler(async ({ data }): Promise<BioPageRow | null> => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const rows = await db
      .select()
      .from(schema.bioPages)
      .where(eq(schema.bioPages.workspaceId, workspace.id))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      handle: row.handle,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      theme: row.theme,
      links: row.links,
      showRecentPosts: row.showRecentPosts,
      recentPostCount: row.recentPostCount,
      createdAt: row.createdAt.toISOString(),
    }
  })

const upsertInput = z.object({
  workspaceSlug: z.string().min(1),
  handle: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  displayName: z.string().max(200).nullable().default(null),
  avatarUrl: z.string().max(2000).nullable().default(null),
  bio: z.string().max(5000).nullable().default(null),
  theme: z.enum(['default', 'dark', 'minimal']).default('default'),
  links: z.array(z.object({ title: z.string().max(200), url: z.string().max(2000) })).default([]),
  showRecentPosts: z.boolean().default(true),
  recentPostCount: z.number().int().min(0).max(50).default(6),
})

export const upsertBioPage = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data }) => {
    const { workspace } = await ensureWs(data.workspaceSlug)
    const values = {
      workspaceId: workspace.id,
      handle: data.handle,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
      bio: data.bio,
      theme: data.theme,
      links: data.links,
      showRecentPosts: data.showRecentPosts,
      recentPostCount: data.recentPostCount,
    }
    const existing = await db
      .select({ id: schema.bioPages.id })
      .from(schema.bioPages)
      .where(eq(schema.bioPages.workspaceId, workspace.id))
      .limit(1)
    if (existing[0]) {
      await db
        .update(schema.bioPages)
        .set(values)
        .where(eq(schema.bioPages.id, existing[0].id))
    } else {
      await db.insert(schema.bioPages).values(values)
    }
    return { ok: true as const }
  })

const publicInput = z.object({ handle: z.string().min(1) })

export const getPublicBioPage = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => publicInput.parse(d))
  .handler(async ({ data }): Promise<PublicBioPage | null> => {
    const rows = await db
      .select()
      .from(schema.bioPages)
      .where(eq(schema.bioPages.handle, data.handle))
      .limit(1)
    const row = rows[0]
    if (!row) return null

    let recentPosts: PublicBioPage['recentPosts'] = []
    if (row.showRecentPosts && row.recentPostCount > 0) {
      const posts = await db
        .select({
          id: schema.posts.id,
          publishedAt: schema.posts.publishedAt,
        })
        .from(schema.posts)
        .where(
          and(
            eq(schema.posts.workspaceId, row.workspaceId),
            eq(schema.posts.status, 'published'),
          ),
        )
        .orderBy(desc(schema.posts.publishedAt))
        .limit(row.recentPostCount)

      for (const p of posts) {
        const versions = await db
          .select({
            content: schema.postVersions.content,
            isDefault: schema.postVersions.isDefault,
            platforms: schema.postVersions.platforms,
          })
          .from(schema.postVersions)
          .where(eq(schema.postVersions.postId, p.id))

        const defaultVersion = versions.find((v) => v.isDefault) ?? versions[0]
        const allPlatforms = versions.flatMap((v) => v.platforms)

        const platforms = await db
          .select({ platform: schema.socialAccounts.platform })
          .from(schema.postPlatforms)
          .innerJoin(
            schema.socialAccounts,
            eq(schema.socialAccounts.id, schema.postPlatforms.socialAccountId),
          )
          .where(eq(schema.postPlatforms.postId, p.id))

        recentPosts.push({
          id: p.id,
          content: defaultVersion?.content ?? '',
          publishedAt: p.publishedAt?.toISOString() ?? '',
          platforms: platforms.length > 0
            ? [...new Set(platforms.map((pp) => pp.platform))]
            : [...new Set(allPlatforms)],
        })
      }
    }

    return {
      id: row.id,
      handle: row.handle,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      theme: row.theme,
      links: row.links,
      showRecentPosts: row.showRecentPosts,
      recentPostCount: row.recentPostCount,
      createdAt: row.createdAt.toISOString(),
      recentPosts,
    }
  })
