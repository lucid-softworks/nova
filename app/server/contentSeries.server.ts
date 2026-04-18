import { and, asc, eq, or } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'

export type ContentSeriesSlot = {
  dayOffset: number
  timeOfDay: string
  contentHint: string
  platforms: string[]
}

export type ContentSeriesRow = {
  id: string
  name: string
  description: string | null
  slots: ContentSeriesSlot[]
  isBuiltIn: boolean
  createdAt: string
}

// -- Built-in templates ------------------------------------------------------

export const BUILT_IN_SERIES: Array<{
  name: string
  description: string
  slots: ContentSeriesSlot[]
}> = [
  {
    name: 'Product Launch Week',
    description: '7-day product launch sequence from teaser to wrap-up',
    slots: [
      { dayOffset: 0, timeOfDay: '09:00', contentHint: 'Teaser — something big is coming', platforms: [] },
      { dayOffset: 1, timeOfDay: '09:00', contentHint: 'Announcement — reveal the product', platforms: [] },
      { dayOffset: 2, timeOfDay: '09:00', contentHint: 'Feature highlight — show what makes it special', platforms: [] },
      { dayOffset: 3, timeOfDay: '09:00', contentHint: 'Testimonial — share early feedback', platforms: [] },
      { dayOffset: 4, timeOfDay: '09:00', contentHint: 'Behind the scenes — how it was built', platforms: [] },
      { dayOffset: 5, timeOfDay: '09:00', contentHint: 'FAQ — answer common questions', platforms: [] },
      { dayOffset: 6, timeOfDay: '09:00', contentHint: 'Wrap-up — recap and call to action', platforms: [] },
    ],
  },
  {
    name: 'Weekly Content Mix',
    description: 'Mon-Fri themed content for consistent engagement',
    slots: [
      { dayOffset: 0, timeOfDay: '08:00', contentHint: 'Motivational Monday — inspire your audience', platforms: [] },
      { dayOffset: 1, timeOfDay: '08:00', contentHint: 'Tip Tuesday — share a useful tip', platforms: [] },
      { dayOffset: 2, timeOfDay: '08:00', contentHint: 'Story Wednesday — tell a story', platforms: [] },
      { dayOffset: 3, timeOfDay: '08:00', contentHint: 'Throwback Thursday — revisit a highlight', platforms: [] },
      { dayOffset: 4, timeOfDay: '08:00', contentHint: 'Fun Friday — lighten the mood', platforms: [] },
    ],
  },
  {
    name: 'Daily Tips',
    description: '7 days of daily tips to educate your audience',
    slots: [
      { dayOffset: 0, timeOfDay: '10:00', contentHint: 'Tip of the day', platforms: [] },
      { dayOffset: 1, timeOfDay: '10:00', contentHint: 'Tip of the day', platforms: [] },
      { dayOffset: 2, timeOfDay: '10:00', contentHint: 'Tip of the day', platforms: [] },
      { dayOffset: 3, timeOfDay: '10:00', contentHint: 'Tip of the day', platforms: [] },
      { dayOffset: 4, timeOfDay: '10:00', contentHint: 'Tip of the day', platforms: [] },
      { dayOffset: 5, timeOfDay: '10:00', contentHint: 'Tip of the day', platforms: [] },
      { dayOffset: 6, timeOfDay: '10:00', contentHint: 'Tip of the day', platforms: [] },
    ],
  },
]

// -- Helpers -----------------------------------------------------------------

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

// -- CRUD --------------------------------------------------------------------

export async function listContentSeriesImpl(slug: string): Promise<ContentSeriesRow[]> {
  const { workspace } = await ensureWs(slug)
  const rows = await db
    .select()
    .from(schema.contentSeries)
    .where(
      or(
        eq(schema.contentSeries.workspaceId, workspace.id),
        eq(schema.contentSeries.isBuiltIn, true),
      ),
    )
    .orderBy(asc(schema.contentSeries.name))

  // If no built-in rows exist yet, return the constants as virtual rows
  const hasBuiltIn = rows.some((r) => r.isBuiltIn)
  const mapped: ContentSeriesRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    slots: (r.slots ?? []) as ContentSeriesSlot[],
    isBuiltIn: r.isBuiltIn,
    createdAt: r.createdAt.toISOString(),
  }))

  if (!hasBuiltIn) {
    for (const b of BUILT_IN_SERIES) {
      mapped.push({
        id: `builtin:${b.name}`,
        name: b.name,
        description: b.description,
        slots: b.slots,
        isBuiltIn: true,
        createdAt: new Date().toISOString(),
      })
    }
  }

  return mapped
}

export async function createContentSeriesImpl(
  slug: string,
  input: { name: string; description?: string | null; slots: ContentSeriesSlot[] },
): Promise<string> {
  const { workspace } = await ensureWs(slug)
  const [row] = await db
    .insert(schema.contentSeries)
    .values({
      workspaceId: workspace.id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      slots: input.slots,
      isBuiltIn: false,
    })
    .returning()
  if (!row) throw new Error('Failed to create content series')
  return row.id
}

export async function deleteContentSeriesImpl(slug: string, id: string): Promise<{ ok: true }> {
  const { workspace } = await ensureWs(slug)
  // Only delete custom series
  await db
    .delete(schema.contentSeries)
    .where(
      and(
        eq(schema.contentSeries.id, id),
        eq(schema.contentSeries.workspaceId, workspace.id),
        eq(schema.contentSeries.isBuiltIn, false),
      ),
    )
  return { ok: true }
}

export async function applyContentSeriesImpl(
  slug: string,
  seriesId: string,
  startDate: string,
): Promise<{ created: number }> {
  const { workspace, user } = await ensureWs(slug)

  // Resolve slots — from DB or from built-in constants
  let slots: ContentSeriesSlot[]
  if (seriesId.startsWith('builtin:')) {
    const name = seriesId.slice('builtin:'.length)
    const found = BUILT_IN_SERIES.find((b) => b.name === name)
    if (!found) throw new Error('Built-in series not found')
    slots = found.slots
  } else {
    const row = await db.query.contentSeries.findFirst({
      where: eq(schema.contentSeries.id, seriesId),
    })
    if (!row) throw new Error('Series not found')
    slots = (row.slots ?? []) as ContentSeriesSlot[]
  }

  const base = new Date(startDate)
  if (isNaN(base.getTime())) throw new Error('Invalid start date')

  let created = 0
  for (const slot of slots) {
    const scheduledAt = new Date(base)
    scheduledAt.setDate(scheduledAt.getDate() + slot.dayOffset)
    const [hours, minutes] = slot.timeOfDay.split(':').map(Number)
    scheduledAt.setHours(hours ?? 0, minutes ?? 0, 0, 0)

    // Create draft post
    const [post] = await db
      .insert(schema.posts)
      .values({
        workspaceId: workspace.id,
        authorId: user.id,
        status: 'draft',
        scheduledAt,
      })
      .returning()
    if (!post) continue

    // Create default version with hint as content
    await db.insert(schema.postVersions).values({
      postId: post.id,
      platforms: slot.platforms.length > 0 ? slot.platforms : [],
      content: slot.contentHint,
      isDefault: true,
    })

    created++
  }

  return { created }
}
