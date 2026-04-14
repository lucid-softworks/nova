import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  scheduleAtImpl,
  addToQueueImpl,
  publishNowImpl,
  submitForApprovalImpl,
  approvePostImpl,
  requestChangesImpl,
} from './scheduling.server'

const scheduleSchema = z.object({
  workspaceSlug: z.string().min(1),
  postId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
})

export const schedulePost = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => scheduleSchema.parse(d))
  .handler(async ({ data }) =>
    scheduleAtImpl(data.workspaceSlug, data.postId, new Date(data.scheduledAt)),
  )

const queueSchema = z.object({
  workspaceSlug: z.string().min(1),
  postId: z.string().uuid(),
})

export const addToQueue = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => queueSchema.parse(d))
  .handler(async ({ data }) => addToQueueImpl(data.workspaceSlug, data.postId))

const publishNowSchema = z.object({
  workspaceSlug: z.string().min(1),
  postId: z.string().uuid(),
})

export const publishNow = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => publishNowSchema.parse(d))
  .handler(async ({ data }) => publishNowImpl(data.workspaceSlug, data.postId))

const submitSchema = z.object({
  workspaceSlug: z.string().min(1),
  postId: z.string().uuid(),
})

export const submitForApproval = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data }) => submitForApprovalImpl(data.workspaceSlug, data.postId))

const approveSchema = z.object({
  workspaceSlug: z.string().min(1),
  postId: z.string().uuid(),
  scheduledAt: z.string().datetime().nullable(),
})

export const approvePost = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => approveSchema.parse(d))
  .handler(async ({ data }) =>
    approvePostImpl(data.workspaceSlug, data.postId, data.scheduledAt),
  )

const requestChangesSchema = z.object({
  workspaceSlug: z.string().min(1),
  postId: z.string().uuid(),
  note: z.string().max(2000),
})

export const requestChanges = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => requestChangesSchema.parse(d))
  .handler(async ({ data }) => requestChangesImpl(data.workspaceSlug, data.postId, data.note))
