import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  listMembersImpl,
  updateMemberRoleImpl,
  removeMemberImpl,
  addMemberByEmailImpl,
  getWorkspaceApprovalImpl,
  setRequireApprovalImpl,
  setApproversImpl,
  type MemberRow,
  type AddMemberResult,
} from './team.server'

export type { MemberRow, AddMemberResult }

const roleEnum = z.enum(['admin', 'manager', 'editor', 'viewer'])

const wsOnly = z.object({ workspaceSlug: z.string().min(1) })

export const listMembers = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => listMembersImpl(data.workspaceSlug))

export const getWorkspaceApproval = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => getWorkspaceApprovalImpl(data.workspaceSlug))

const updateRoleSchema = z.object({
  workspaceSlug: z.string().min(1),
  memberId: z.string().uuid(),
  role: roleEnum,
})

export const updateMemberRole = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => updateRoleSchema.parse(d))
  .handler(async ({ data }) =>
    updateMemberRoleImpl(data.workspaceSlug, data.memberId, data.role),
  )

const removeSchema = z.object({
  workspaceSlug: z.string().min(1),
  memberId: z.string().uuid(),
})

export const removeMember = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => removeSchema.parse(d))
  .handler(async ({ data }) => removeMemberImpl(data.workspaceSlug, data.memberId))

const addSchema = z.object({
  workspaceSlug: z.string().min(1),
  email: z.string().email(),
  role: roleEnum,
})

export const addMemberByEmail = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => addSchema.parse(d))
  .handler(async ({ data }) => addMemberByEmailImpl(data.workspaceSlug, data.email, data.role))

const toggleSchema = z.object({
  workspaceSlug: z.string().min(1),
  value: z.boolean(),
})

export const setRequireApproval = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => toggleSchema.parse(d))
  .handler(async ({ data }) => setRequireApprovalImpl(data.workspaceSlug, data.value))

const approversSchema = z.object({
  workspaceSlug: z.string().min(1),
  userIds: z.array(z.string()),
})

export const setApprovers = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => approversSchema.parse(d))
  .handler(async ({ data }) => setApproversImpl(data.workspaceSlug, data.userIds))
