export const RESHARE_PLATFORMS = [
  'x',
  'tumblr',
  'facebook',
  'linkedin',
  'threads',
  'bluesky',
  'mastodon',
  'reddit',
] as const

export type ResharePlatform = (typeof RESHARE_PLATFORMS)[number]

export type ReshareSource = {
  sourcePostId: string
  sourcePostUrl: string
  sourceAuthorHandle: string
  sourceAuthorName: string
  sourceContent: string
  sourceMediaUrls: string[]
  postedAt: string | null
  stats: { likes?: number; reposts?: number; replies?: number }
  platformExtra: Record<string, string>
}

export type BrowseResult =
  | { kind: 'ok'; items: ReshareSource[] }
  | { kind: 'unsupported'; message: string }
