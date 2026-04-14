import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { browseAccountImpl, searchPostsImpl, queueResharesImpl } from './reshare.server'
import { RESHARE_PLATFORMS } from './reshare-types'

export type { BrowseResult, ReshareSource } from './reshare-types'
export { RESHARE_PLATFORMS } from './reshare-types'

const platformSchema = z.enum(RESHARE_PLATFORMS)

const browseSchema = z.object({
  workspaceSlug: z.string().min(1),
  platform: platformSchema,
  handle: z.string().min(1),
})

export const browseAccount = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => browseSchema.parse(d))
  .handler(async ({ data }) => browseAccountImpl(data.workspaceSlug, data.platform, data.handle))

const searchSchema = z.object({
  workspaceSlug: z.string().min(1),
  platform: platformSchema,
  query: z.string().min(1),
  subreddit: z.string().nullable(),
})

export const searchPosts = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => searchSchema.parse(d))
  .handler(async ({ data }) =>
    searchPostsImpl(data.workspaceSlug, data.platform, data.query, data.subreddit),
  )

const queueSchema = z.object({
  workspaceSlug: z.string().min(1),
  targetSocialAccountId: z.string().uuid(),
  platform: platformSchema,
  scheduledAt: z.string().datetime().nullable(),
  items: z
    .array(
      z.object({
        sourcePostId: z.string().min(1),
        sourcePostUrl: z.string().url(),
        sourceAuthorHandle: z.string(),
        sourceAuthorName: z.string(),
        sourceContent: z.string(),
        sourceMediaUrls: z.array(z.string()),
        reshareType: z.enum(['repost', 'quote', 'reblog', 'boost', 'crosspost', 'share']),
        quoteComment: z.string().nullable(),
        targetSubreddit: z.string().nullable(),
        platformExtra: z.record(z.string(), z.string()).optional(),
      }),
    )
    .min(1),
})

export const queueReshares = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => queueSchema.parse(d))
  .handler(async ({ data }) => queueResharesImpl(data))
