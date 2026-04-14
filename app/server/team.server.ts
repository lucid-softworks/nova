import { and, eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '~/lib/auth'
import { db, schema } from './db'
import { requireWorkspaceDetail } from './session.server'
import { notifyWorkspaceAdmins } from './notifications.server'
import type { WorkspaceRole } from './types'

export type MemberRow = {
  id: string
  userId: string
  role: WorkspaceRole
  name: string
  email: string
  image: string | null
  joinedAt: string | null
  invitedAt: string
  isSelf: boolean
}

export type InvitationRow = {
  id: string
  email: string
  role: WorkspaceRole
  status: string
  expiresAt: string
  inviterName: string | null
}

async function ensureDetail(slug: string) {
  const r = await requireWorkspaceDetail(slug)
  if (!r.ok) throw new Error(r.reason)
  return r
}

function canManageTeam(role: WorkspaceRole): boolean {
  return role === 'admin' || role === 'manager'
}

function canManageSettings(role: WorkspaceRole): boolean {
  return role === 'admin'
}

export async function listMembersImpl(slug: string): Promise<MemberRow[]> {
  const { detail, user: currentUser } = await ensureDetail(slug)
  const rows = await db
    .select({
      id: schema.member.id,
      userId: schema.user.id,
      role: schema.member.role,
      name: schema.user.name,
      email: schema.user.email,
      image: schema.user.image,
      createdAt: schema.member.createdAt,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(eq(schema.member.organizationId, detail.organizationId))

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    role: r.role as WorkspaceRole,
    name: r.name,
    email: r.email,
    image: r.image,
    joinedAt: r.createdAt.toISOString(),
    invitedAt: r.createdAt.toISOString(),
    isSelf: r.userId === currentUser.id,
  }))
}

export async function listInvitationsImpl(slug: string): Promise<InvitationRow[]> {
  const { detail } = await ensureDetail(slug)
  if (!canManageTeam(detail.role)) throw new Error('Insufficient permission')
  const rows = await db
    .select({
      id: schema.invitation.id,
      email: schema.invitation.email,
      role: schema.invitation.role,
      status: schema.invitation.status,
      expiresAt: schema.invitation.expiresAt,
      inviterName: schema.user.name,
    })
    .from(schema.invitation)
    .leftJoin(schema.user, eq(schema.user.id, schema.invitation.inviterId))
    .where(eq(schema.invitation.organizationId, detail.organizationId))
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: (r.role ?? 'editor') as WorkspaceRole,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    inviterName: r.inviterName,
  }))
}

export async function updateMemberRoleImpl(
  slug: string,
  memberId: string,
  newRole: WorkspaceRole,
) {
  const { detail, user: me } = await ensureDetail(slug)
  if (!canManageTeam(detail.role)) throw new Error('Insufficient permission')

  const target = await db.query.member.findFirst({
    where: and(
      eq(schema.member.id, memberId),
      eq(schema.member.organizationId, detail.organizationId),
    ),
  })
  if (!target) throw new Error('Member not found')
  if (target.userId === me.id) throw new Error("You can't change your own role")
  if (target.role === 'admin' && detail.role !== 'admin') {
    throw new Error("Only admins can modify another admin's role")
  }
  if (newRole === 'admin' && detail.role !== 'admin') {
    throw new Error('Only admins can promote to admin')
  }

  await db
    .update(schema.member)
    .set({ role: newRole })
    .where(eq(schema.member.id, memberId))
  return { ok: true }
}

export async function removeMemberImpl(slug: string, memberId: string) {
  const { detail, user: me } = await ensureDetail(slug)
  if (!canManageTeam(detail.role)) throw new Error('Insufficient permission')

  const target = await db.query.member.findFirst({
    where: and(
      eq(schema.member.id, memberId),
      eq(schema.member.organizationId, detail.organizationId),
    ),
  })
  if (!target) throw new Error('Member not found')
  if (target.userId === me.id) throw new Error("You can't remove yourself")
  if (target.role === 'admin' && detail.role !== 'admin') {
    throw new Error('Only admins can remove another admin')
  }

  await db.delete(schema.member).where(eq(schema.member.id, memberId))
  await db
    .delete(schema.workspaceApprovers)
    .where(
      and(
        eq(schema.workspaceApprovers.workspaceId, detail.workspaceId),
        eq(schema.workspaceApprovers.userId, target.userId),
      ),
    )
  return { ok: true }
}

export type AddMemberResult =
  | { kind: 'ok'; memberId: string }
  | { kind: 'invited'; invitationId: string }
  | { kind: 'already_member' }

export async function addMemberByEmailImpl(
  slug: string,
  email: string,
  role: WorkspaceRole,
): Promise<AddMemberResult> {
  const { detail } = await ensureDetail(slug)
  if (!canManageTeam(detail.role)) throw new Error('Insufficient permission')
  if (role === 'admin' && detail.role !== 'admin') {
    throw new Error('Only admins can invite admins')
  }

  const normalizedEmail = email.trim().toLowerCase()
  const target = await db.query.user.findFirst({
    where: eq(schema.user.email, normalizedEmail),
  })

  // Existing user → add directly to member; skip the email round-trip.
  if (target) {
    const existing = await db.query.member.findFirst({
      where: and(
        eq(schema.member.organizationId, detail.organizationId),
        eq(schema.member.userId, target.id),
      ),
    })
    if (existing) return { kind: 'already_member' }

    const [row] = await db
      .insert(schema.member)
      .values({
        id: randomUUID(),
        organizationId: detail.organizationId,
        userId: target.id,
        role,
      })
      .returning({ id: schema.member.id })
    if (!row) throw new Error('Failed to add member')

    await notifyWorkspaceAdmins({
      workspaceId: detail.workspaceId,
      type: 'member_joined',
      title: 'New workspace member',
      body: `${target.name} joined as ${role}.`,
      data: { userId: target.id },
    })
    return { kind: 'ok', memberId: row.id }
  }

  // No user yet → create an invitation via the plugin, which posts the
  // email through our configured sendInvitationEmail handler.
  const result = (await auth.api.createInvitation({
    headers: getRequest().headers,
    body: {
      email: normalizedEmail,
      role,
      organizationId: detail.organizationId,
    },
  })) as { id: string } | { invitation: { id: string } }
  const invitationId = 'id' in result ? result.id : result.invitation.id
  return { kind: 'invited', invitationId }
}

export async function cancelInvitationImpl(slug: string, invitationId: string) {
  const { detail } = await ensureDetail(slug)
  if (!canManageTeam(detail.role)) throw new Error('Insufficient permission')
  const target = await db.query.invitation.findFirst({
    where: and(
      eq(schema.invitation.id, invitationId),
      eq(schema.invitation.organizationId, detail.organizationId),
    ),
  })
  if (!target) throw new Error('Invitation not found')
  await db.delete(schema.invitation).where(eq(schema.invitation.id, invitationId))
  return { ok: true }
}

// -- Approval settings -----------------------------------------------------

export async function getWorkspaceApprovalImpl(slug: string) {
  const { detail } = await ensureDetail(slug)
  const approvers = await db
    .select({ userId: schema.workspaceApprovers.userId })
    .from(schema.workspaceApprovers)
    .where(eq(schema.workspaceApprovers.workspaceId, detail.workspaceId))
  return {
    requireApproval: detail.requireApproval,
    approverUserIds: approvers.map((a) => a.userId),
  }
}

export async function setRequireApprovalImpl(slug: string, value: boolean) {
  const { detail } = await ensureDetail(slug)
  if (!canManageSettings(detail.role)) throw new Error('Admins only')
  await db
    .update(schema.workspaces)
    .set({ requireApproval: value })
    .where(eq(schema.workspaces.id, detail.workspaceId))
  return { ok: true }
}

export async function setApproversImpl(slug: string, userIds: string[]) {
  const { detail } = await ensureDetail(slug)
  if (!canManageSettings(detail.role)) throw new Error('Admins only')

  // Approvers must be org members with admin/manager role.
  if (userIds.length > 0) {
    const valid = await db
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, detail.organizationId),
          inArray(schema.member.userId, userIds),
          inArray(schema.member.role, ['admin', 'manager']),
        ),
      )
    const validSet = new Set(valid.map((v) => v.userId))
    for (const id of userIds) {
      if (!validSet.has(id)) throw new Error('Approvers must be admins or managers')
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.workspaceApprovers)
      .where(eq(schema.workspaceApprovers.workspaceId, detail.workspaceId))
    for (const userId of userIds) {
      await tx
        .insert(schema.workspaceApprovers)
        .values({ workspaceId: detail.workspaceId, userId })
    }
  })
  return { ok: true }
}
