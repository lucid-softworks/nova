import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { encrypt } from '~/lib/encryption'
import type { PublishMedia } from './index'

export async function loadMediaBuffer(
  media: PublishMedia,
): Promise<{ buf: Buffer; mime: string }> {
  if (media.url.startsWith('/media/')) {
    const dir = process.env.STORAGE_LOCAL_PATH ?? './storage'
    const filename = media.url.slice('/media/'.length)
    const abs = path.join(dir, filename)
    const buf = await readFile(abs)
    return { buf, mime: media.mimeType }
  }
  const res = await fetch(media.url)
  if (!res.ok) throw new Error(`fetch media ${media.url} failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  return { buf, mime: media.mimeType }
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
