import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { createHmac } from 'node:crypto'
import { db, schema } from '~/server/db'

export function unsubscribeUrl(userId: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required')
  const token = createHmac('sha256', secret).update(`digest:${userId}`).digest('hex').slice(0, 24)
  return `${base.replace(/\/+$/, '')}/digest/unsubscribe?uid=${encodeURIComponent(userId)}&token=${token}`
}

export type DigestSummary = {
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  userId: string
  userEmail: string
  userName: string
  published: number
  publishedByPlatform: Record<string, number>
  failed: number
  unreadInbox: number
  upcoming: Array<{ id: string; scheduledAt: string; snippet: string }>
}

export async function buildDigestFor(
  userId: string,
  workspaceId: string,
): Promise<DigestSummary | null> {
  const [userRow, wsRow] = await Promise.all([
    db.query.user.findFirst({ where: eq(schema.user.id, userId) }),
    db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) }),
  ])
  if (!userRow || !wsRow) return null
  const org = await db.query.organization.findFirst({
    where: eq(schema.organization.id, wsRow.organizationId),
  })

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
  const weekAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000)

  const publishedRows = await db
    .select({
      id: schema.posts.id,
      platform: schema.socialAccounts.platform,
    })
    .from(schema.posts)
    .leftJoin(schema.postPlatforms, eq(schema.postPlatforms.postId, schema.posts.id))
    .leftJoin(
      schema.socialAccounts,
      eq(schema.socialAccounts.id, schema.postPlatforms.socialAccountId),
    )
    .where(
      and(
        eq(schema.posts.workspaceId, workspaceId),
        eq(schema.posts.status, 'published'),
        gte(schema.posts.publishedAt, weekAgo),
      ),
    )
  const publishedIds = new Set(publishedRows.map((r) => r.id))
  const publishedByPlatform: Record<string, number> = {}
  for (const r of publishedRows) {
    if (!r.platform) continue
    publishedByPlatform[r.platform] = (publishedByPlatform[r.platform] ?? 0) + 1
  }

  const failedRows = await db
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.workspaceId, workspaceId),
        eq(schema.posts.status, 'failed'),
        gte(schema.posts.updatedAt, weekAgo),
      ),
    )

  const inboxRows = await db
    .select({ id: schema.inboxItems.id })
    .from(schema.inboxItems)
    .where(
      and(
        eq(schema.inboxItems.workspaceId, workspaceId),
        isNull(schema.inboxItems.readAt),
      ),
    )

  const upcoming = await db
    .select({
      id: schema.posts.id,
      scheduledAt: schema.posts.scheduledAt,
    })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.workspaceId, workspaceId),
        eq(schema.posts.status, 'scheduled'),
        gte(schema.posts.scheduledAt, now),
        lte(schema.posts.scheduledAt, weekAhead),
      ),
    )
    .limit(5)

  let snippets: Array<{ id: string; scheduledAt: string; snippet: string }> = []
  if (upcoming.length > 0) {
    const ids = upcoming.map((u) => u.id)
    const versions = await db
      .select({
        postId: schema.postVersions.postId,
        content: schema.postVersions.content,
        isDefault: schema.postVersions.isDefault,
      })
      .from(schema.postVersions)
      .where(inArray(schema.postVersions.postId, ids))
    const byPost = new Map<string, string>()
    for (const v of versions) {
      if (v.isDefault || !byPost.has(v.postId)) byPost.set(v.postId, v.content)
    }
    snippets = upcoming
      .filter((u) => u.scheduledAt)
      .map((u) => ({
        id: u.id,
        scheduledAt: u.scheduledAt!.toISOString(),
        snippet: (byPost.get(u.id) ?? '').slice(0, 120),
      }))
  }

  return {
    workspaceId,
    workspaceName: org?.name ?? 'Workspace',
    workspaceSlug: org?.slug ?? '',
    userId,
    userEmail: userRow.email,
    userName: userRow.name,
    published: publishedIds.size,
    publishedByPlatform,
    failed: failedRows.length,
    unreadInbox: inboxRows.length,
    upcoming: snippets,
  }
}

export function renderDigest(summary: DigestSummary): { subject: string; text: string; html: string } {
  const subject = `Your weekly SocialHub summary — ${summary.workspaceName}`
  const platformLines = Object.entries(summary.publishedByPlatform)
    .map(([p, n]) => `  • ${p}: ${n}`)
    .join('\n')

  const upcomingLines = summary.upcoming
    .map((u) => `  • ${new Date(u.scheduledAt).toLocaleString()} — ${u.snippet}`)
    .join('\n')

  const unsub = unsubscribeUrl(summary.userId)
  const text = `Hi ${summary.userName},

Here's what happened in ${summary.workspaceName} this week.

Published: ${summary.published}
${platformLines || '  (none)'}

Failed: ${summary.failed}
Unread inbox: ${summary.unreadInbox}

Coming up next 7 days:
${upcomingLines || '  (nothing scheduled)'}

— SocialHub

Unsubscribe: ${unsub}`

  const html = `<div style="font-family:system-ui;max-width:560px;margin:24px auto;color:#111">
  <h2 style="margin:0 0 8px">${escapeHtml(summary.workspaceName)} — weekly summary</h2>
  <p style="color:#666">Hi ${escapeHtml(summary.userName)},</p>
  <table style="width:100%;border-collapse:collapse;margin:12px 0">
    <tr><td style="padding:4px 0">Published</td><td style="padding:4px 0;text-align:right"><b>${summary.published}</b></td></tr>
    <tr><td style="padding:4px 0">Failed</td><td style="padding:4px 0;text-align:right"><b>${summary.failed}</b></td></tr>
    <tr><td style="padding:4px 0">Unread inbox</td><td style="padding:4px 0;text-align:right"><b>${summary.unreadInbox}</b></td></tr>
  </table>
  ${
    Object.keys(summary.publishedByPlatform).length
      ? `<h3 style="margin:16px 0 4px;font-size:14px">By platform</h3><ul>${Object.entries(
          summary.publishedByPlatform,
        )
          .map(([p, n]) => `<li>${escapeHtml(p)}: ${n}</li>`)
          .join('')}</ul>`
      : ''
  }
  ${
    summary.upcoming.length
      ? `<h3 style="margin:16px 0 4px;font-size:14px">Scheduled next 7 days</h3><ul>${summary.upcoming
          .map(
            (u) =>
              `<li>${new Date(u.scheduledAt).toLocaleString()} — ${escapeHtml(u.snippet)}</li>`,
          )
          .join('')}</ul>`
      : ''
  }
  <p style="color:#888;font-size:12px;margin-top:24px">
    <a href="${unsub}" style="color:#888">Unsubscribe from weekly digests</a>
  </p>
</div>`
  return { subject, text, html }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}
