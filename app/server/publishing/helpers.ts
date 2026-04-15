import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { encrypt } from '~/lib/encryption'
import { getStorage, keyFromUrl } from '~/server/storage'
import type { PublishMedia } from './index'

export async function loadMediaBuffer(
  media: PublishMedia,
): Promise<{ buf: Buffer; mime: string }> {
  const key = keyFromUrl(media.url)
  if (key) {
    try {
      const buf = await getStorage().getBuffer(key)
      return { buf, mime: media.mimeType }
    } catch {
      // Fall through to raw fetch (e.g. pre-migration URLs on a host we
      // still happen to have HTTP access to).
    }
  }
  const res = await fetch(media.url)
  if (!res.ok) throw new Error(`fetch media ${media.url} failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  return { buf, mime: media.mimeType }
}

/**
 * Read a byte range for chunked platform uploads (YouTube/TikTok/LinkedIn
 * resumable flows). Falls back to HTTP Range when the URL doesn't map to a
 * storage key we own.
 */
export async function loadMediaRange(
  media: PublishMedia,
  start: number,
  endInclusive: number,
): Promise<Buffer> {
  const key = keyFromUrl(media.url)
  if (key) {
    try {
      return await getStorage().getRange(key, start, endInclusive)
    } catch {
      // Fall through.
    }
  }
  const res = await fetch(media.url, {
    headers: { Range: `bytes=${start}-${endInclusive}` },
  })
  if (!res.ok && res.status !== 206) {
    throw new Error(`range fetch ${media.url} failed (${res.status})`)
  }
  return Buffer.from(await res.arrayBuffer())
}

export async function persistRefreshedTokens(
  accountId: string,
  tokens: { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null },
): Promise<void> {
  const patch: Record<string, unknown> = {
    accessToken: encrypt(tokens.accessToken),
    lastSyncedAt: new Date(),
  }
  if (tokens.refreshToken !== undefined) {
    patch.refreshToken = tokens.refreshToken ? encrypt(tokens.refreshToken) : null
  }
  if (tokens.expiresAt !== undefined) patch.tokenExpiresAt = tokens.expiresAt
  await db
    .update(schema.socialAccounts)
    .set(patch)
    .where(eq(schema.socialAccounts.id, accountId))
}
