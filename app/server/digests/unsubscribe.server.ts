import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'

function expected(userId: string): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required')
  return createHmac('sha256', secret).update(`digest:${userId}`).digest('hex').slice(0, 24)
}

export async function processUnsubscribe(
  uid: string,
  token: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!uid || !token) return { ok: false, reason: 'missing params' }
  if (token !== expected(uid)) return { ok: false, reason: 'invalid token' }
  await db.update(schema.user).set({ digestOptIn: false }).where(eq(schema.user.id, uid))
  return { ok: true }
}
