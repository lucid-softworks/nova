import { and, eq, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function makeSlug(length = 6): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length]
  return out
}

export async function shortenUrlImpl(
  slug: string,
  targetUrl: string,
): Promise<{ slug: string; url: string }> {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  try {
    new URL(targetUrl)
  } catch {
    throw new Error('Invalid URL')
  }

  // Dedup on exact target inside the workspace.
  const existing = await db.query.shortLinks.findFirst({
    where: and(
      eq(schema.shortLinks.workspaceId, r.workspace.id),
      eq(schema.shortLinks.targetUrl, targetUrl),
    ),
  })
  if (existing) {
    return { slug: existing.slug, url: publicShortUrl(existing.slug) }
  }

  // Try a few slugs before giving up (6-char alphabet collision is rare).
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = makeSlug(6 + Math.floor(attempt / 2))
    try {
      await db.insert(schema.shortLinks).values({
        workspaceId: r.workspace.id,
        slug: candidate,
        targetUrl,
        createdById: r.user.id,
      })
      return { slug: candidate, url: publicShortUrl(candidate) }
    } catch {
      // unique violation — retry
    }
  }
  throw new Error('Failed to mint a short link slug')
}

export async function resolveShortLinkImpl(slug: string): Promise<string | null> {
  const row = await db.query.shortLinks.findFirst({
    where: eq(schema.shortLinks.slug, slug),
  })
  if (!row) return null
  // Fire and forget — the redirect shouldn't wait on a counter update.
  void db
    .update(schema.shortLinks)
    .set({ clickCount: sql`${schema.shortLinks.clickCount} + 1` })
    .where(eq(schema.shortLinks.id, row.id))
  return row.targetUrl
}

function publicShortUrl(slug: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/+$/, '')}/l/${slug}`
}
