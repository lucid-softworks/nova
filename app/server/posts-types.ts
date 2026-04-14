import type { PlatformKey } from '~/lib/platforms'

export type PostsTab =
  | 'all'
  | 'scheduled'
  | 'published'
  | 'drafts'
  | 'pending_approval'
  | 'failed'
  | 'queue'

export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'pending_approval'

export type PostRowPlatformTarget = {
  socialAccountId: string
  platform: PlatformKey
  accountHandle: string
  status: 'pending' | 'published' | 'failed'
  publishedUrl: string | null
}

export type PostRow = {
  id: string
  type: 'original' | 'reshare'
  status: PostStatus
  scheduledAt: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  failureReason: string | null
  isQueue: boolean
  authorName: string | null
  authorId: string | null
  campaignId: string | null
  campaignName: string | null
  campaignStepOrder: number | null
  versionCount: number
  defaultContent: string
  firstMediaUrl: string | null
  firstMediaMime: string | null
  platforms: PostRowPlatformTarget[]
  reshareSource: {
    platform: PlatformKey
    authorHandle: string
    preview: string
  } | null
}

export type CountsByStatus = Record<PostsTab, number>

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'partial'
  | 'on_hold'

export type CampaignSummary = {
  id: string
  name: string
  status: CampaignStatus
  updatedAt: string
  steps: Array<{
    id: string
    stepOrder: number
    status: string
    triggerType: 'immediate' | 'delay' | 'scheduled' | null
    triggerDelayMinutes: number | null
    triggerScheduledAt: string | null
    dependsOnStepId: string | null
    post: PostRow | null
  }>
}

export type CampaignDetail = CampaignSummary & {
  stepsWithPlatforms: Array<CampaignSummary['steps'][number] & { publishedUrls: string[] }>
}
