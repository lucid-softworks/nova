import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from './db'
import { loadSessionContext } from './session.server'

const toggleInput = z.object({ optIn: z.boolean() })

export const setDigestOptIn = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => toggleInput.parse(d))
  .handler(async ({ data }) => {
    const ctx = await loadSessionContext()
    if (!ctx.user) throw new Error('Not authenticated')
    await db
      .update(schema.user)
      .set({ digestOptIn: data.optIn })
      .where(eq(schema.user.id, ctx.user.id))
    return { ok: true as const }
  })

export const getDigestOptIn = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await loadSessionContext()
  if (!ctx.user) return { optIn: false }
  const row = await db.query.user.findFirst({
    where: eq(schema.user.id, ctx.user.id),
    columns: { digestOptIn: true },
  })
  return { optIn: row?.digestOptIn ?? false }
})
