import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  createApprovalTokenImpl,
  listApprovalTokensImpl,
  revokeApprovalTokenImpl,
  getReviewContextImpl,
  approvePostViaTokenImpl,
  requestChangesViaTokenImpl,
  type ReviewContext,
  type ReviewPost,
} from './approvalPortal.server'

export type { ReviewContext, ReviewPost }

const createTokenSchema = z.object({
  workspaceSlug: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
})

export const createApprovalToken = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createTokenSchema.parse(d))
  .handler(async ({ data }) =>
    createApprovalTokenImpl(data.workspaceSlug, {
      email: data.email,
      name: data.name,
      expiresInDays: data.expiresInDays,
    }),
  )

const wsSlug = z.object({ workspaceSlug: z.string().min(1) })

export const listApprovalTokens = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsSlug.parse(d))
  .handler(async ({ data }) => listApprovalTokensImpl(data.workspaceSlug))

const revokeSchema = z.object({
  workspaceSlug: z.string().min(1),
  tokenId: z.string().uuid(),
})

export const revokeApprovalToken = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => revokeSchema.parse(d))
  .handler(async ({ data }) => revokeApprovalTokenImpl(data.workspaceSlug, data.tokenId))

const tokenOnly = z.object({ token: z.string().min(1) })

export const getReviewContext = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => tokenOnly.parse(d))
  .handler(async ({ data }) => getReviewContextImpl(data.token))

const approveViaTokenSchema = z.object({
  token: z.string().min(1),
  postId: z.string().uuid(),
  reviewerName: z.string().nullable(),
})

export const approvePostViaToken = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => approveViaTokenSchema.parse(d))
  .handler(async ({ data }) =>
    approvePostViaTokenImpl(data.token, data.postId, data.reviewerName),
  )

const requestChangesViaTokenSchema = z.object({
  token: z.string().min(1),
  postId: z.string().uuid(),
  note: z.string().min(1).max(2000),
  reviewerName: z.string().nullable(),
})

export const requestChangesViaToken = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => requestChangesViaTokenSchema.parse(d))
  .handler(async ({ data }) =>
    requestChangesViaTokenImpl(data.token, data.postId, data.note, data.reviewerName),
  )
