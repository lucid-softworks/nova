import { randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'

async function ensureAdminOrManager(slug: string) {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  if (r.workspace.role !== 'admin' && r.workspace.role !== 'manager') {
    throw new Error('Insufficient permission')
  }
  return r
}

async function workspaceBySlug(slug: string) {
  const row = await db
    .select({
      id: schema.workspaces.id,
      orgName: schema.organization.name,
      orgSlug: schema.organization.slug,
    })
    .from(schema.workspaces)
    .innerJoin(
      schema.organization,
      eq(schema.organization.id, schema.workspaces.organizationId),
    )
    .where(eq(schema.organization.slug, slug))
    .limit(1)
  return row[0] ?? null
}

export async function createApprovalTokenImpl(
  slug: string,
  input: { email: string; name?: string | null; expiresInDays?: number },
) {
  const { workspace, user } = await ensureAdminOrManager(slug)
  const token = randomBytes(24).toString('base64url')
  const expiresInDays = input.expiresInDays ?? 7
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000)

  const [row] = await db
    .insert(schema.approvalTokens)
    .values({
      workspaceId: workspace.id,
      email: input.email,
      name: input.name ?? null,
      token,
      expiresAt,
      createdById: user.id,
    })
    .returning()

  const baseUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const url = `${baseUrl}/review/${token}`

  return { token, url, id: row!.id }
}

export async function listApprovalTokensImpl(slug: string) {
  const { workspace } = await ensureAdminOrManager(slug)
  const rows = await db
    .select({
      id: schema.approvalTokens.id,
      email: schema.approvalTokens.email,
      name: schema.approvalTokens.name,
      token: schema.approvalTokens.token,
      expiresAt: schema.approvalTokens.expiresAt,
      createdAt: schema.approvalTokens.createdAt,
    })
    .from(schema.approvalTokens)
    .where(
      and(
        eq(schema.approvalTokens.workspaceId, workspace.id),
        gt(schema.approvalTokens.expiresAt, new Date()),
      ),
    )
  return rows
}

export async function revokeApprovalTokenImpl(slug: string, tokenId: string) {
  const { workspace } = await ensureAdminOrManager(slug)
  await db
    .delete(schema.approvalTokens)
    .where(
      and(
        eq(schema.approvalTokens.id, tokenId),
        eq(schema.approvalTokens.workspaceId, workspace.id),
      ),
    )
  return { ok: true }
}

export type ReviewPost = {
  id: string
  content: string
  platforms: string[]
  authorName: string | null
}

export type ReviewContext = {
  workspaceName: string
  posts: ReviewPost[]
}

export async function getReviewContextImpl(
  token: string,
): Promise<{ ok: true; data: ReviewContext } | { ok: false; reason: 'invalid' | 'expired' }> {
  const row = await db
    .select({
      id: schema.approvalTokens.id,
      workspaceId: schema.approvalTokens.workspaceId,
      expiresAt: schema.approvalTokens.expiresAt,
    })
    .from(schema.approvalTokens)
    .where(eq(schema.approvalTokens.token, token))
    .limit(1)

  const hit = row[0]
  if (!hit) return { ok: false, reason: 'invalid' }
  if (hit.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' }

  const ws = await db
    .select({ name: schema.organization.name })
    .from(schema.workspaces)
    .innerJoin(
      schema.organization,
      eq(schema.organization.id, schema.workspaces.organizationId),
    )
    .where(eq(schema.workspaces.id, hit.workspaceId))
    .limit(1)

  const workspaceName = ws[0]?.name ?? 'Unknown'

  const postsRaw = await db
    .select({
      id: schema.posts.id,
      authorId: schema.posts.authorId,
    })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.workspaceId, hit.workspaceId),
        eq(schema.posts.status, 'pending_approval'),
      ),
    )

  const posts: ReviewPost[] = []
  for (const p of postsRaw) {
    const versions = await db
      .select({
        content: schema.postVersions.content,
        platforms: schema.postVersions.platforms,
        isDefault: schema.postVersions.isDefault,
      })
      .from(schema.postVersions)
      .where(eq(schema.postVersions.postId, p.id))

    const def = versions.find((v) => v.isDefault) ?? versions[0]
    const content = def?.content ?? ''
    const platforms = def?.platforms ?? []

    let authorName: string | null = null
    if (p.authorId) {
      const u = await db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.id, p.authorId))
        .limit(1)
      authorName = u[0]?.name ?? null
    }

    posts.push({ id: p.id, content, platforms, authorName })
  }

  return { ok: true, data: { workspaceName, posts } }
}

/**
 * Approve a post from the external review portal (token-based, no session).
 */
export async function approvePostViaTokenImpl(token: string, postId: string, reviewerName: string | null) {
  const tokenRow = await db
    .select({
      workspaceId: schema.approvalTokens.workspaceId,
      expiresAt: schema.approvalTokens.expiresAt,
      name: schema.approvalTokens.name,
    })
    .from(schema.approvalTokens)
    .where(eq(schema.approvalTokens.token, token))
    .limit(1)

  const hit = tokenRow[0]
  if (!hit) throw new Error('Invalid token')
  if (hit.expiresAt.getTime() < Date.now()) throw new Error('Token expired')

  const post = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.workspaceId, hit.workspaceId)),
  })
  if (!post) throw new Error('Post not found')

  const when = new Date(Date.now() + 5_000)
  await db
    .update(schema.posts)
    .set({ status: 'scheduled', scheduledAt: when, failedAt: null, failureReason: null })
    .where(eq(schema.posts.id, postId))
  await db
    .insert(schema.postActivity)
    .values({
      postId,
      userId: null,
      action: 'approved',
      note: `Approved by external reviewer: ${reviewerName ?? hit.name ?? 'Unknown'}`,
    })
  return { postId, scheduledAt: when.toISOString() }
}

/**
 * Request changes from the external review portal (token-based, no session).
 */
export async function requestChangesViaTokenImpl(token: string, postId: string, note: string, reviewerName: string | null) {
  const tokenRow = await db
    .select({
      workspaceId: schema.approvalTokens.workspaceId,
      expiresAt: schema.approvalTokens.expiresAt,
      name: schema.approvalTokens.name,
    })
    .from(schema.approvalTokens)
    .where(eq(schema.approvalTokens.token, token))
    .limit(1)

  const hit = tokenRow[0]
  if (!hit) throw new Error('Invalid token')
  if (hit.expiresAt.getTime() < Date.now()) throw new Error('Token expired')

  const post = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.workspaceId, hit.workspaceId)),
  })
  if (!post) throw new Error('Post not found')

  await db
    .update(schema.posts)
    .set({ status: 'draft' })
    .where(eq(schema.posts.id, postId))
  await db
    .insert(schema.postActivity)
    .values({
      postId,
      userId: null,
      action: 'rejected',
      note: `${reviewerName ?? hit.name ?? 'External reviewer'}: ${note}`,
    })
  return { ok: true }
}
