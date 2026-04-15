import { and, eq, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, schema } from '~/server/db'
import type { ShortenCtx, ShortenResult, ShortenerProvider } from '../types'

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function mintSlug(length = 6): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length]
  return out
}

function publicUrl(slug: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/+$/, '')}/l/${slug}`
}

export const local: ShortenerProvider = {
  name: 'local',
  async shorten(ctx: ShortenCtx): Promise<ShortenResult> {
    const existing = await db.query.shortLinks.findFirst({
      where: and(
        eq(schema.shortLinks.workspaceId, ctx.workspaceId),
        eq(schema.shortLinks.targetUrl, ctx.targetUrl),
      ),
    })
    if (existing) return { url: publicUrl(existing.slug), slug: existing.slug, externalId: null }

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = mintSlug(6 + Math.floor(attempt / 2))
      try {
        await db.insert(schema.shortLinks).values({
          workspaceId: ctx.workspaceId,
          slug: candidate,
          targetUrl: ctx.targetUrl,
          createdById: ctx.userId,
        })
        return { url: publicUrl(candidate), slug: candidate, externalId: null }
      } catch {
        // unique violation — retry
      }
    }
    throw new Error('Failed to mint a short link slug')
  },
  async resolve(slug: string): Promise<string | null> {
    const row = await db.query.shortLinks.findFirst({
      where: eq(schema.shortLinks.slug, slug),
    })
    if (!row) return null
    void db
      .update(schema.shortLinks)
      .set({ clickCount: sql`${schema.shortLinks.clickCount} + 1` })
      .where(eq(schema.shortLinks.id, row.id))
    return row.targetUrl
  },
  betterAuthPlugin() {
    return null
  },
}
