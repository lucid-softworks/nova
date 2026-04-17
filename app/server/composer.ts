import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { PLATFORM_KEYS } from '~/lib/platforms'
import { saveDraftImpl, loadPostForComposerImpl, type LoadedPost } from './composer.server'

export type { LoadedPost, LoadedPostVersion, LoadedPostMedia } from './composer.server'

const platformKeySchema = z.enum(PLATFORM_KEYS)

const versionSchema = z.object({
  platforms: z.array(platformKeySchema),
  content: z.string().max(100_000),
  firstComment: z.string().max(10_000).nullable(),
  isThread: z.boolean(),
  threadParts: z
    .array(z.object({ content: z.string(), mediaIds: z.array(z.string().uuid()) }))
    .default([]),
  mediaIds: z.array(z.string().uuid()).default([]),
  altTextByMediaId: z.record(z.string().uuid(), z.string().max(2000)).default({}),
  isDefault: z.boolean(),
})

const saveDraftSchema = z.object({
  workspaceSlug: z.string().min(1),
  postId: z.string().uuid().optional(),
  mode: z.enum(['shared', 'independent']),
  socialAccountIds: z.array(z.string().uuid()).default([]),
  versions: z.array(versionSchema).min(1),
  reddit: z
    .object({
      title: z.string().max(300),
      subreddit: z.string(),
      postType: z.enum(['text', 'link', 'image', 'video']),
      nsfw: z.boolean(),
      spoiler: z.boolean(),
    })
    .nullable()
    .default(null),
  replyToPostId: z.string().nullable().default(null),
})

export const saveDraft = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => saveDraftSchema.parse(d))
  .handler(async ({ data }) => saveDraftImpl(data))

const loadSchema = z.object({
  workspaceSlug: z.string().min(1),
  postId: z.string().uuid(),
})

export const loadPostForComposer = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => loadSchema.parse(d))
  .handler(async ({ data }): Promise<LoadedPost> =>
    loadPostForComposerImpl(data.workspaceSlug, data.postId),
  )
