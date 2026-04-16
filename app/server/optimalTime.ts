import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'

export type OptimalSlot = {
  dayOfWeek: number
  hour: number
  avgEngagements: number
  posts: number
}

const input = z.object({
  workspaceSlug: z.string().min(1),
  accountId: z.string().uuid().nullable().default(null),
})

export const getOptimalTimes = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<OptimalSlot[]> => {
    const r = await requireWorkspaceAccess(data.workspaceSlug)
    if (!r.ok) throw new Error(r.reason)

    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000)

    const ppWhere = [
      eq(schema.posts.workspaceId, r.workspace.id),
      eq(schema.posts.status, 'published'),
      gte(schema.postPlatforms.publishedAt, since),
    ]
    if (data.accountId) {
      ppWhere.push(eq(schema.postPlatforms.socialAccountId, data.accountId))
    }

    const rows = await db
      .select({
        ppId: schema.postPlatforms.id,
        publishedAt: schema.postPlatforms.publishedAt,
      })
      .from(schema.postPlatforms)
      .innerJoin(schema.posts, eq(schema.posts.id, schema.postPlatforms.postId))
      .where(and(...ppWhere))

    if (rows.length === 0) return []

    const ppIds = rows.map((r) => r.ppId)
    const metrics = await db
      .select({
        postPlatformId: schema.postMetricsSnapshots.postPlatformId,
        date: schema.postMetricsSnapshots.date,
        engagements: schema.postMetricsSnapshots.engagements,
        likes: schema.postMetricsSnapshots.likes,
        comments: schema.postMetricsSnapshots.comments,
        shares: schema.postMetricsSnapshots.shares,
        clicks: schema.postMetricsSnapshots.clicks,
      })
      .from(schema.postMetricsSnapshots)
      .where(inArray(schema.postMetricsSnapshots.postPlatformId, ppIds))
      .orderBy(desc(schema.postMetricsSnapshots.date))

    const engByPP = new Map<string, number>()
    for (const m of metrics) {
      if (engByPP.has(m.postPlatformId)) continue
      engByPP.set(
        m.postPlatformId,
        m.engagements || m.likes + m.comments + m.shares + m.clicks,
      )
    }

    const buckets = new Map<string, { total: number; count: number }>()
    for (const r of rows) {
      if (!r.publishedAt) continue
      const d = new Date(r.publishedAt)
      const key = `${d.getUTCDay()}-${d.getUTCHours()}`
      const entry = buckets.get(key) ?? { total: 0, count: 0 }
      entry.count++
      entry.total += engByPP.get(r.ppId) ?? 0
      buckets.set(key, entry)
    }

    const slots: OptimalSlot[] = []
    for (const [key, val] of buckets) {
      const [dow, hour] = key.split('-').map(Number) as [number, number]
      slots.push({
        dayOfWeek: dow,
        hour,
        avgEngagements: val.count > 0 ? val.total / val.count : 0,
        posts: val.count,
      })
    }
    return slots.sort((a, b) => b.avgEngagements - a.avgEngagements)
  })
