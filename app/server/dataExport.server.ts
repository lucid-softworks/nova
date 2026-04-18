import { eq, inArray } from 'drizzle-orm'
import { db, schema } from './db'
import { loadSessionContext } from './session.server'

async function requireUser() {
  const ctx = await loadSessionContext()
  if (!ctx.user) throw new Error('Unauthorized')
  return { user: ctx.user }
}

/**
 * Build a JSON dump of everything we store about the requesting user
 * plus every workspace they belong to. Used by the GDPR "export my
 * data" button. Returns plain JSON-serialisable objects; callers wrap
 * with Content-Disposition at the route layer.
 *
 * Scope rules:
 *  - the user row itself (profile, prefs — NO password/2FA secret)
 *  - every membership (workspaces they're in + their role)
 *  - posts they authored across those workspaces
 *  - social accounts they connected
 *  - activity rows they're the actor for
 *  - notifications addressed to them
 *  - auth log rows matching their email
 */
export async function exportMyDataImpl(): Promise<{
  exportedAt: string
  user: Record<string, unknown>
  workspaces: Record<string, unknown>[]
  posts: Record<string, unknown>[]
  socialAccounts: Record<string, unknown>[]
  activity: Record<string, unknown>[]
  notifications: Record<string, unknown>[]
  authActivity: Record<string, unknown>[]
  bioPages: Record<string, unknown>[]
}> {
  const { user } = await requireUser()

  // Profile — explicitly allow-list fields so we don't leak secrets
  // (twoFactorSecret, password hashes, etc.) into the dump.
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, user.id) })
  const profile = u
    ? {
        id: u.id,
        email: u.email,
        emailVerified: u.emailVerified,
        name: u.name,
        image: u.image,
        avatarUrl: u.avatarUrl,
        role: u.role,
        banned: u.banned,
        banReason: u.banReason,
        banExpires: u.banExpires?.toISOString() ?? null,
        twoFactorEnabled: u.twoFactorEnabled,
        notificationPreferences: u.notificationPreferences ?? {},
        digestOptIn: u.digestOptIn,
        createdAt: u.createdAt.toISOString(),
      }
    : null

  // Memberships → which workspaces
  const memberships = await db
    .select({
      orgId: schema.member.organizationId,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
    })
    .from(schema.member)
    .where(eq(schema.member.userId, user.id))
  const orgIds = memberships.map((m) => m.orgId)
  const workspaceRows = orgIds.length
    ? await db
        .select({
          id: schema.workspaces.id,
          organizationId: schema.workspaces.organizationId,
          appName: schema.workspaces.appName,
          timezone: schema.workspaces.timezone,
          defaultLanguage: schema.workspaces.defaultLanguage,
          createdAt: schema.workspaces.createdAt,
        })
        .from(schema.workspaces)
        .where(inArray(schema.workspaces.organizationId, orgIds))
    : []
  const workspaceIds = workspaceRows.map((w) => w.id)
  const orgRows = orgIds.length
    ? await db
        .select({
          id: schema.organization.id,
          name: schema.organization.name,
          slug: schema.organization.slug,
        })
        .from(schema.organization)
        .where(inArray(schema.organization.id, orgIds))
    : []
  const orgById = new Map(orgRows.map((o) => [o.id, o]))
  const workspaces = workspaceRows.map((w) => {
    const membership = memberships.find((m) => m.orgId === w.organizationId)
    const org = orgById.get(w.organizationId)
    return {
      id: w.id,
      name: org?.name ?? null,
      slug: org?.slug ?? null,
      appName: w.appName,
      timezone: w.timezone,
      defaultLanguage: w.defaultLanguage,
      yourRole: membership?.role ?? null,
      joinedAt: membership?.createdAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
    }
  })

  // Posts the user authored
  const postRows = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.authorId, user.id))
  const postIds = postRows.map((p) => p.id)
  const versionRows = postIds.length
    ? await db
        .select({
          postId: schema.postVersions.postId,
          content: schema.postVersions.content,
          isDefault: schema.postVersions.isDefault,
        })
        .from(schema.postVersions)
        .where(inArray(schema.postVersions.postId, postIds))
    : []
  const defaultContentByPost = new Map<string, string>()
  for (const v of versionRows) {
    if (v.isDefault) defaultContentByPost.set(v.postId, v.content)
  }
  const posts = postRows.map((p) => ({
    id: p.id,
    workspaceId: p.workspaceId,
    type: p.type,
    status: p.status,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    content: defaultContentByPost.get(p.id) ?? '',
    createdAt: p.createdAt.toISOString(),
  }))

  // Social accounts
  const accountRows = workspaceIds.length
    ? await db
        .select()
        .from(schema.socialAccounts)
        .where(inArray(schema.socialAccounts.workspaceId, workspaceIds))
    : []
  const socialAccounts = accountRows.map((a) => ({
    id: a.id,
    workspaceId: a.workspaceId,
    platform: a.platform,
    accountName: a.accountName,
    accountHandle: a.accountHandle,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    // Deliberately omit access/refresh tokens, encrypted secrets.
  }))

  // Post activity where they were the actor
  const activityRows = await db
    .select()
    .from(schema.postActivity)
    .where(eq(schema.postActivity.userId, user.id))
  const activity = activityRows.map((a) => ({
    id: a.id,
    postId: a.postId,
    action: a.action,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
  }))

  // Notifications addressed to the user
  const notificationRows = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
  const notifications = notificationRows.map((n) => ({
    id: n.id,
    workspaceId: n.workspaceId,
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }))

  // Auth log rows keyed to this user's email (sign-ins + sign-ups)
  const authRows = u?.email
    ? await db
        .select()
        .from(schema.authLoginAttempts)
        .where(eq(schema.authLoginAttempts.email, u.email))
    : []
  const authActivity = authRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    success: r.success,
    reason: r.reason,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
  }))

  // Bio pages (scoped to workspaces the user belongs to)
  const bioRows = workspaceIds.length
    ? await db
        .select()
        .from(schema.bioPages)
        .where(inArray(schema.bioPages.workspaceId, workspaceIds))
    : []
  const bioPages = bioRows.map((b) => ({
    id: b.id,
    workspaceId: b.workspaceId,
    handle: b.handle,
    displayName: b.displayName,
    avatarUrl: b.avatarUrl,
    bio: b.bio,
    theme: b.theme,
    links: b.links,
    createdAt: b.createdAt.toISOString(),
  }))

  return {
    exportedAt: new Date().toISOString(),
    user: profile ?? {},
    workspaces,
    posts,
    socialAccounts,
    activity,
    notifications,
    authActivity,
    bioPages,
  }
}
