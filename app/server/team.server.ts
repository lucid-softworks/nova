import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
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

async function ensureWs(slug: string) {
  const r = await requireWorkspaceAccess(slug)
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
  const { workspace, user: currentUser } = await ensureWs(slug)
  const rows = await db
    .select({
      id: schema.workspaceMembers.id,
      userId: schema.user.id,
      role: schema.workspaceMembers.role,
      name: schema.user.name,
      email: schema.user.email,
      image: schema.user.image,
      joinedAt: schema.workspaceMembers.joinedAt,
      invitedAt: schema.workspaceMembers.invitedAt,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, workspace.id))

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    role: r.role,
    name: r.name,
    email: r.email,
    image: r.image,
    joinedAt: r.joinedAt?.toISOString() ?? null,
    invitedAt: r.invitedAt.toISOString(),
    isSelf: r.userId === currentUser.id,
  }))
}

export async function updateMemberRoleImpl(
  slug: string,
  memberId: string,
  newRole: WorkspaceRole,
) {
  const { workspace, user: me } = await ensureWs(slug)
  if (!canManageTeam(workspace.role)) throw new Error('Insufficient permission')

  const target = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(schema.workspaceMembers.id, memberId),
      eq(schema.workspaceMembers.workspaceId, workspace.id),
    ),
  })
  if (!target) throw new Error('Member not found')
  if (target.userId === me.id) throw new Error("You can't change your own role")
  if (target.role === 'admin' && workspace.role !== 'admin') {
    throw new Error("Only admins can modify another admin's role")
  }
  if (newRole === 'admin' && workspace.role !== 'admin') {
    throw new Error('Only admins can promote to admin')
  }

  await db
    .update(schema.workspaceMembers)
    .set({ role: newRole })
    .where(eq(schema.workspaceMembers.id, memberId))
  return { ok: true }
}

export async function removeMemberImpl(slug: string, memberId: string) {
  const { workspace, user: me } = await ensureWs(slug)
  if (!canManageTeam(workspace.role)) throw new Error('Insufficient permission')

  const target = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(schema.workspaceMembers.id, memberId),
      eq(schema.workspaceMembers.workspaceId, workspace.id),
    ),
  })
  if (!target) throw new Error('Member not found')
  if (target.userId === me.id) throw new Error("You can't remove yourself")
  if (target.userId === (await getOwnerId(workspace.id))) {
    throw new Error("The workspace owner can't be removed")
  }
  if (target.role === 'admin' && workspace.role !== 'admin') {
    throw new Error('Only admins can remove another admin')
  }

  await db.delete(schema.workspaceMembers).where(eq(schema.workspaceMembers.id, memberId))
  // Also drop any approver row
  await db
    .delete(schema.workspaceApprovers)
    .where(
      and(
        eq(schema.workspaceApprovers.workspaceId, workspace.id),
        eq(schema.workspaceApprovers.userId, target.userId),
      ),
    )
  return { ok: true }
}

async function getOwnerId(workspaceId: string): Promise<string> {
  const w = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  })
  return w?.ownerId ?? ''
}

export type AddMemberResult =
  | { kind: 'ok'; memberId: string }
  | { kind: 'no_such_user' }
  | { kind: 'already_member' }

export async function addMemberByEmailImpl(
  slug: string,
  email: string,
  role: WorkspaceRole,
): Promise<AddMemberResult> {
  const { workspace } = await ensureWs(slug)
  if (!canManageTeam(workspace.role)) throw new Error('Insufficient permission')
  if (role === 'admin' && workspace.role !== 'admin') {
    throw new Error('Only admins can invite admins')
  }

  const target = await db.query.user.findFirst({
    where: eq(schema.user.email, email.trim().toLowerCase()),
  })
  if (!target) return { kind: 'no_such_user' }

  const existing = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(schema.workspaceMembers.workspaceId, workspace.id),
      eq(schema.workspaceMembers.userId, target.id),
    ),
  })
  if (existing) return { kind: 'already_member' }

  const [row] = await db
    .insert(schema.workspaceMembers)
    .values({
      workspaceId: workspace.id,
      userId: target.id,
      role,
      joinedAt: new Date(),
    })
    .returning({ id: schema.workspaceMembers.id })
  if (!row) throw new Error('Failed to add member')

  await notifyWorkspaceAdmins({
    workspaceId: workspace.id,
    type: 'member_joined',
    title: 'New workspace member',
    body: `${target.name} joined as ${role}.`,
    data: { userId: target.id },
  })

  return { kind: 'ok', memberId: row.id }
}

// -- Approval settings -----------------------------------------------------

export async function getWorkspaceApprovalImpl(slug: string) {
  const { workspace } = await ensureWs(slug)
  const ws = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspace.id),
  })
  const approvers = await db
    .select({ userId: schema.workspaceApprovers.userId })
    .from(schema.workspaceApprovers)
    .where(eq(schema.workspaceApprovers.workspaceId, workspace.id))
  return {
    requireApproval: ws?.requireApproval ?? false,
    approverUserIds: approvers.map((a) => a.userId),
  }
}

export async function setRequireApprovalImpl(slug: string, value: boolean) {
  const { workspace } = await ensureWs(slug)
  if (!canManageSettings(workspace.role)) throw new Error('Admins only')
  await db
    .update(schema.workspaces)
    .set({ requireApproval: value })
    .where(eq(schema.workspaces.id, workspace.id))
  return { ok: true }
}

export async function setApproversImpl(slug: string, userIds: string[]) {
  const { workspace } = await ensureWs(slug)
  if (!canManageSettings(workspace.role)) throw new Error('Admins only')

  // Ensure all userIds are actually members of this workspace with
  // admin/manager role.
  if (userIds.length > 0) {
    const valid = await db
      .select({ userId: schema.workspaceMembers.userId })
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, workspace.id),
          inArray(schema.workspaceMembers.userId, userIds),
          inArray(schema.workspaceMembers.role, ['admin', 'manager']),
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
      .where(eq(schema.workspaceApprovers.workspaceId, workspace.id))
    for (const userId of userIds) {
      await tx.insert(schema.workspaceApprovers).values({ workspaceId: workspace.id, userId })
    }
  })
  return { ok: true }
}
