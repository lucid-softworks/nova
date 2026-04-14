import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { PLATFORM_KEYS } from '~/lib/platforms'
import {
  listPostsImpl,
  countsByStatusImpl,
  listCampaignsImpl,
  getCampaignDetailImpl,
  deletePostsImpl,
  duplicatePostImpl,
  retryPostImpl,
  changeToDraftImpl,
} from './posts.server'

export type {
  PostsTab,
  PostRow,
  CountsByStatus,
  CampaignSummary,
  CampaignDetail,
  PostStatus,
  PostRowPlatformTarget,
  CampaignStatus,
} from './posts-types'

const tabs = ['all', 'scheduled', 'published', 'drafts', 'pending_approval', 'failed', 'queue'] as const

const listSchema = z.object({
  workspaceSlug: z.string().min(1),
  tab: z.enum(tabs),
  search: z.string().nullable(),
  platforms: z.array(z.enum(PLATFORM_KEYS)),
  type: z.enum(['all', 'original', 'reshare']),
  authorId: z.string().uuid().nullable(),
  fromIso: z.string().datetime().nullable(),
  toIso: z.string().datetime().nullable(),
})

export const listPosts = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data }) => listPostsImpl(data))

const wsOnly = z.object({ workspaceSlug: z.string().min(1) })

export const countsByStatus = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => countsByStatusImpl(data.workspaceSlug))

export const listCampaigns = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => listCampaignsImpl(data.workspaceSlug))

const campaignDetailSchema = z.object({
  workspaceSlug: z.string().min(1),
  campaignId: z.string().uuid(),
})

export const getCampaignDetail = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => campaignDetailSchema.parse(d))
  .handler(async ({ data }) => getCampaignDetailImpl(data.workspaceSlug, data.campaignId))

const batchSchema = z.object({
  workspaceSlug: z.string().min(1),
  postIds: z.array(z.string().uuid()).min(1),
})

export const deletePosts = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => batchSchema.parse(d))
  .handler(async ({ data }) => deletePostsImpl(data.workspaceSlug, data.postIds))

export const changeToDraft = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => batchSchema.parse(d))
  .handler(async ({ data }) => changeToDraftImpl(data.workspaceSlug, data.postIds))

const singleSchema = z.object({
  workspaceSlug: z.string().min(1),
  postId: z.string().uuid(),
})

export const duplicatePost = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => singleSchema.parse(d))
  .handler(async ({ data }) => duplicatePostImpl(data.workspaceSlug, data.postId))

export const retryPost = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => singleSchema.parse(d))
  .handler(async ({ data }) => retryPostImpl(data.workspaceSlug, data.postId))
