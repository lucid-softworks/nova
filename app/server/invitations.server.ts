import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '~/lib/auth'
import { db, schema } from './db'
import { loadSessionContext } from './session.server'

export type LoadedInvitation = {
  id: string
  orgName: string
  orgSlug: string
  role: string
  email: string
  inviterName: string | null
  expiresAt: string
} | null

export async function loadInvitationImpl(invitationId: string): Promise<LoadedInvitation> {
  const rows = await db
    .select({
      id: schema.invitation.id,
      email: schema.invitation.email,
      role: schema.invitation.role,
      status: schema.invitation.status,
      expiresAt: schema.invitation.expiresAt,
      orgName: schema.organization.name,
      orgSlug: schema.organization.slug,
      inviterName: schema.user.name,
    })
    .from(schema.invitation)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.invitation.organizationId))
    .leftJoin(schema.user, eq(schema.user.id, schema.invitation.inviterId))
    .where(eq(schema.invitation.id, invitationId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (row.status !== 'pending') return null
  if (row.expiresAt.getTime() < Date.now()) return null
  return {
    id: row.id,
    email: row.email,
    role: row.role ?? 'editor',
    orgName: row.orgName,
    orgSlug: row.orgSlug,
    inviterName: row.inviterName,
    expiresAt: row.expiresAt.toISOString(),
  }
}

export async function acceptInvitationImpl(
  invitationId: string,
  reject: boolean,
): Promise<{ slug: string | null }> {
  const ctx = await loadSessionContext()
  if (!ctx.user) throw new Error('unauthenticated')

  if (reject) {
    // Try the plugin's reject endpoint; fall back to marking status.
    try {
      await auth.api.rejectInvitation({
        headers: getRequest().headers,
        body: { invitationId },
      })
    } catch {
      await db
        .update(schema.invitation)
        .set({ status: 'rejected' })
        .where(eq(schema.invitation.id, invitationId))
    }
    return { slug: null }
  }

  // Try the plugin's accept endpoint first — it handles user/email
  // matching and writes the member row in one shot.
  try {
    await auth.api.acceptInvitation({
      headers: getRequest().headers,
      body: { invitationId },
    })
  } catch {
    // Fall back: manual accept. This also covers the "no plugin endpoint"
    // case if the plugin contract shifts.
    const inv = await db.query.invitation.findFirst({
      where: eq(schema.invitation.id, invitationId),
    })
    if (!inv) throw new Error('Invitation not found')
    if (inv.status !== 'pending') throw new Error('Invitation is not pending')
    if (inv.email.toLowerCase() !== (ctx.user.email ?? '').toLowerCase()) {
      throw new Error('This invitation was sent to a different email address')
    }
    const alreadyMember = await db.query.member.findFirst({
      where: and(
        eq(schema.member.organizationId, inv.organizationId),
        eq(schema.member.userId, ctx.user.id),
      ),
    })
    if (!alreadyMember) {
      await db.insert(schema.member).values({
        id: randomUUID(),
        organizationId: inv.organizationId,
        userId: ctx.user.id,
        role: inv.role ?? 'editor',
      })
    }
    await db
      .update(schema.invitation)
      .set({ status: 'accepted' })
      .where(eq(schema.invitation.id, invitationId))
  }

  // Resolve slug for redirect.
  const row = await db
    .select({ slug: schema.organization.slug })
    .from(schema.invitation)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.invitation.organizationId))
    .where(eq(schema.invitation.id, invitationId))
    .limit(1)
  return { slug: row[0]?.slug ?? null }
}
