import type { PlatformKey } from '~/lib/platforms'

export type PublishAccount = {
  id: string
  platform: PlatformKey
  accountName: string
  accountHandle: string
  workspaceId: string
  accessToken: string
  refreshToken: string | null
  metadata: Record<string, unknown>
}

export type PublishVersion = {
  id: string
  content: string
  firstComment: string | null
  isThread: boolean
  threadParts: { content: string; mediaIds: string[] }[]
  mediaIds: string[]
  platformVariables: Record<string, string>
}

export type PublishMedia = {
  id: string
  url: string
  mimeType: string
  originalName: string
  size: number
}

export type PublishRedditFields = {
  title: string
  subreddit: string
  postType: 'text' | 'link' | 'image' | 'video'
  nsfw: boolean
  spoiler: boolean
} | null

export type PublishResult = {
  platformPostId: string
  url: string
  publishedAt: Date
}

export type ResharePayload = {
  sourcePlatform: PlatformKey
  sourcePostId: string
  sourcePostUrl: string
  reshareType: 'repost' | 'quote' | 'reblog' | 'boost' | 'crosspost' | 'share'
  quoteComment: string | null
  targetSubreddit: string | null
}

export type PublishContext = {
  account: PublishAccount
  version: PublishVersion
  media: PublishMedia[]
  reddit: PublishRedditFields
}

export type ReshareContext = {
  account: PublishAccount
  reshare: ResharePayload
}

import * as facebook from './original/facebook'
import * as instagram from './original/instagram'
import * as xOriginal from './original/x'
import * as linkedin from './original/linkedin'
import * as youtube from './original/youtube'
import * as tiktok from './original/tiktok'
import * as pinterest from './original/pinterest'
import * as threads from './original/threads'
import * as bluesky from './original/bluesky'
import * as mastodon from './original/mastodon'
import * as tumblr from './original/tumblr'
import * as reddit from './original/reddit'

import * as xReshare from './reshare/x'
import * as tumblrReshare from './reshare/tumblr'
import * as facebookReshare from './reshare/facebook'
import * as linkedinReshare from './reshare/linkedin'
import * as threadsReshare from './reshare/threads'
import * as blueskyReshare from './reshare/bluesky'
import * as mastodonReshare from './reshare/mastodon'
import * as redditReshare from './reshare/reddit'

const original: Record<PlatformKey, (ctx: PublishContext) => Promise<PublishResult>> = {
  facebook: facebook.publishPost,
  instagram: instagram.publishPost,
  x: xOriginal.publishPost,
  linkedin: linkedin.publishPost,
  youtube: youtube.publishPost,
  tiktok: tiktok.publishPost,
  pinterest: pinterest.publishPost,
  threads: threads.publishPost,
  bluesky: bluesky.publishPost,
  mastodon: mastodon.publishPost,
  tumblr: tumblr.publishPost,
  reddit: reddit.publishPost,
}

const reshare: Partial<Record<PlatformKey, (ctx: ReshareContext) => Promise<PublishResult>>> = {
  x: xReshare.resharePost,
  tumblr: tumblrReshare.resharePost,
  facebook: facebookReshare.resharePost,
  linkedin: linkedinReshare.resharePost,
  threads: threadsReshare.resharePost,
  bluesky: blueskyReshare.resharePost,
  mastodon: mastodonReshare.resharePost,
  reddit: redditReshare.resharePost,
}

export async function publishOriginal(ctx: PublishContext): Promise<PublishResult> {
  const fn = original[ctx.account.platform]
  return fn(ctx)
}

export async function publishReshare(ctx: ReshareContext): Promise<PublishResult> {
  const fn = reshare[ctx.account.platform]
  if (!fn) throw new Error(`Reshare not supported on ${ctx.account.platform}`)
  return fn(ctx)
}
