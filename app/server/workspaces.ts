import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { loadSessionContext } from './auth-context'
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
  .validator((d: unknown) => createInput.parse(d))
  .handler(async ({ data }) => {
    const ctx = await loadSessionContext()
    if (!ctx.user) throw new Error('Not authenticated')

    const slug = data.slug ?? slugify(data.name)
    if (!slug) throw new Error('Invalid slug')

    const existing = await db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.slug, slug))
      .limit(1)
    if (existing[0]) throw new Error('Slug already taken')

    const [ws] = await db
      .insert(schema.workspaces)
      .values({ name: data.name, slug, ownerId: ctx.user.id })
      .returning()
    if (!ws) throw new Error('Failed to create workspace')

    await db.insert(schema.workspaceMembers).values({
      workspaceId: ws.id,
      userId: ctx.user.id,
      role: 'admin',
      joinedAt: new Date(),
    })

    // Invites: in stage 1 we record pending invites as members without joinedAt
    // keyed by a placeholder user. Real invite emails are added later.
    return { id: ws.id, slug: ws.slug }
  })

const slugCheckInput = z.object({ slug: z.string().min(1) })

export const isSlugAvailable = createServerFn({ method: 'GET' })
  .validator((d: unknown) => slugCheckInput.parse(d))
  .handler(async ({ data }) => {
    const slug = slugify(data.slug)
    if (!slug) return { available: false, slug }
    const rows = await db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.slug, slug))
      .limit(1)
    return { available: rows.length === 0, slug }
  })
