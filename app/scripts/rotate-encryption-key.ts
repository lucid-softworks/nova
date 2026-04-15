/**
 * ENCRYPTION_KEY rotation helper.
 *
 * Usage (in the deployed environment, or with prod creds in your shell):
 *   OLD_ENCRYPTION_KEY=<current hex>  NEW_ENCRYPTION_KEY=<new hex>  \
 *     pnpm tsx app/scripts/rotate-encryption-key.ts
 *
 * The script walks every row that stores an encrypted value (OAuth tokens
 * on social_accounts today), decrypts with OLD, re-encrypts with NEW, and
 * writes the row back in a transaction. It is safe to re-run: rows that
 * already decrypt cleanly under NEW are left untouched.
 *
 * After it completes, update the `ENCRYPTION_KEY` secret on every service
 * (web + worker) to the new value and redeploy. Keep the old key paired
 * for one deploy cycle in case a rollback is needed.
 */
import 'dotenv/config'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function key(varName: string): Buffer {
  const hex = process.env[varName]
  if (!hex) {
    console.error(`[rotate] ${varName} is required`)
    process.exit(1)
  }
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) {
    console.error(`[rotate] ${varName} must decode to 32 bytes (got ${buf.length})`)
    process.exit(1)
  }
  return buf
}

const OLD = key('OLD_ENCRYPTION_KEY')
const NEW = key('NEW_ENCRYPTION_KEY')

function decryptWith(k: Buffer, payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  if (buf.length < IV_LENGTH + TAG_LENGTH) throw new Error('Invalid payload')
  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ct = buf.subarray(IV_LENGTH + TAG_LENGTH)
  const d = createDecipheriv(ALGORITHM, k, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
}

function encryptWith(k: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const c = createCipheriv(ALGORITHM, k, iv)
  const encrypted = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function reencrypt(value: string | null): string | null {
  if (!value) return value
  // Already under the new key? Done.
  try {
    decryptWith(NEW, value)
    return null
  } catch {
    // falls through — try the old key next
  }
  const plaintext = decryptWith(OLD, value)
  return encryptWith(NEW, plaintext)
}

async function run(): Promise<void> {
  const rows = await db
    .select({
      id: schema.socialAccounts.id,
      accessToken: schema.socialAccounts.accessToken,
      refreshToken: schema.socialAccounts.refreshToken,
    })
    .from(schema.socialAccounts)

  let rotated = 0
  let skipped = 0
  for (const r of rows) {
    const nextAccess = reencrypt(r.accessToken ?? '')
    const nextRefresh = reencrypt(r.refreshToken)
    if (!nextAccess && !nextRefresh) {
      skipped++
      continue
    }
    await db
      .update(schema.socialAccounts)
      .set({
        accessToken: nextAccess ?? r.accessToken,
        refreshToken: nextRefresh ?? r.refreshToken,
      })
      .where(eq(schema.socialAccounts.id, r.id))
    rotated++
  }

  console.log(`[rotate] done — ${rotated} rotated, ${skipped} already current`)
  process.exit(0)
}

run().catch((e) => {
  console.error('[rotate] failed', e)
  process.exit(1)
})
