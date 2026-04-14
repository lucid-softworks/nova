import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  scheduleAtImpl,
  addToQueueImpl,
  publishNowImpl,
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
