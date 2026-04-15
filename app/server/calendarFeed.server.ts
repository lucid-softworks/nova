import { and, eq, gte, inArray, lte, or } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, schema } from './db'
import { buildIcs, type IcsEvent } from '~/lib/ical'
import { requireWorkspaceAccess } from './session.server'

function mintToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function ensureCalendarFeedTokenImpl(slug: string): Promise<string> {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  const ws = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, r.workspace.id),
  })
  if (ws?.calendarFeedToken) return ws.calendarFeedToken
  const token = mintToken()
  await db
    .update(schema.workspaces)
    .set({ calendarFeedToken: token })
    .where(eq(schema.workspaces.id, r.workspace.id))
  return token
}

export async function regenerateCalendarFeedTokenImpl(slug: string): Promise<string> {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  if (r.workspace.role !== 'admin' && r.workspace.role !== 'manager') {
    throw new Error('Only admins or managers can rotate the calendar feed URL')
  }
  const token = mintToken()
  await db
    .update(schema.workspaces)
    .set({ calendarFeedToken: token })
    .where(eq(schema.workspaces.id, r.workspace.id))
  return token
}

export async function buildFeedForTokenImpl(token: string): Promise<string | null> {
  const ws = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.calendarFeedToken, token),
  })
  if (!ws) return null
  const org = await db.query.organization.findFirst({
    where: eq(schema.organization.id, ws.organizationId),
  })

  const now = new Date()
  const windowStart = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
  const windowEnd = new Date(now.getTime() + 90 * 24 * 3600 * 1000)

  const posts = await db
    .select({
      id: schema.posts.id,
      status: schema.posts.status,
      scheduledAt: schema.posts.scheduledAt,
      publishedAt: schema.posts.publishedAt,
    })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.workspaceId, ws.id),
        inArray(schema.posts.status, ['scheduled', 'published', 'publishing']),
        or(
          and(
            gte(schema.posts.scheduledAt, windowStart),
            lte(schema.posts.scheduledAt, windowEnd),
          ),
          and(
            gte(schema.posts.publishedAt, windowStart),
            lte(schema.posts.publishedAt, windowEnd),
          ),
        ),
      ),
    )

  if (posts.length === 0) {
    return buildIcs(org?.name ?? 'SocialHub', [])
  }

  const postIds = posts.map((p) => p.id)
  const [versions, platforms] = await Promise.all([
    db
      .select({
        postId: schema.postVersions.postId,
        content: schema.postVersions.content,
        isDefault: schema.postVersions.isDefault,
      })
      .from(schema.postVersions)
      .where(inArray(schema.postVersions.postId, postIds)),
    db
      .select({
        postId: schema.postPlatforms.postId,
        platform: schema.socialAccounts.platform,
        accountHandle: schema.socialAccounts.accountHandle,
      })
      .from(schema.postPlatforms)
      .innerJoin(
        schema.socialAccounts,
        eq(schema.socialAccounts.id, schema.postPlatforms.socialAccountId),
      )
      .where(inArray(schema.postPlatforms.postId, postIds)),
  ])

  const contentByPost = new Map<string, string>()
  for (const v of versions) {
    if (v.isDefault || !contentByPost.has(v.postId)) contentByPost.set(v.postId, v.content)
  }
  const targetsByPost = new Map<string, string[]>()
  for (const p of platforms) {
    const list = targetsByPost.get(p.postId) ?? []
    list.push(`${p.platform}:${p.accountHandle}`)
    targetsByPost.set(p.postId, list)
  }

  const events: IcsEvent[] = posts.map((p) => {
    const content = contentByPost.get(p.id) ?? ''
    const handles = targetsByPost.get(p.id) ?? []
    const start = p.publishedAt ?? p.scheduledAt ?? now
    const summary = content.slice(0, 80) || `(${p.status} post)`
    const description = [content, handles.length ? `\nTargets: ${handles.join(', ')}` : '']
      .filter(Boolean)
      .join('')
    const base = process.env.APP_URL ?? 'http://localhost:3000'
    const url = `${base.replace(/\/+$/, '')}/${org?.slug ?? ''}/compose?postId=${p.id}`
    return {
      uid: `post-${p.id}@nova`,
      start,
      summary,
      description,
      url,
    }
  })

  return buildIcs(org?.name ?? 'SocialHub', events)
}
