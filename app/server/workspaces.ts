import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { loadSessionContext } from './session.server'
import { db, schema } from './db'
import { slugify } from '~/lib/utils'

const createInput = z.object({
  name: z.string().min(1).max(80),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, hyphens')
    .optional(),
  invites: z
    .array(
      z.object({
        email: z.string().email(),
        role: z.enum(['admin', 'manager', 'editor', 'viewer']),
      }),
    )
    .default([]),
})

export const createWorkspace = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data }) => {
    const ctx = await loadSessionContext()
    if (!ctx.user) throw new Error('Not authenticated')

    const slug = data.slug ?? slugify(data.name)
    if (!slug) throw new Error('Invalid slug')

    const existing = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.slug, slug))
      .limit(1)
    if (existing[0]) throw new Error('Slug already taken')

    // Create org + satellite workspaces row + self-membership in one tx.
    const userId = ctx.user.id
    const org = await db.transaction(async (tx) => {
      const orgId = randomUUID()
      await tx.insert(schema.organization).values({
        id: orgId,
        name: data.name,
        slug,
      })
      const [ws] = await tx
        .insert(schema.workspaces)
        .values({ organizationId: orgId })
        .returning()
      if (!ws) throw new Error('Failed to create workspace')
      await tx.insert(schema.member).values({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: 'admin',
      })
      return { id: orgId, slug, workspaceId: ws.id }
    })

    return { id: org.workspaceId, slug: org.slug }
  })

const slugCheckInput = z.object({ slug: z.string().min(1) })

export const isSlugAvailable = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => slugCheckInput.parse(d))
  .handler(async ({ data }) => {
    const slug = slugify(data.slug)
    if (!slug) return { available: false, slug }
    const rows = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.slug, slug))
      .limit(1)
    return { available: rows.length === 0, slug }
  })
