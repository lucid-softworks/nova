export type InboxKind = 'mention' | 'reply' | 'like' | 'repost' | 'follow' | 'dm'

export type InboxFetchItem = {
  platformItemId: string
  kind: InboxKind
  actorHandle: string | null
  actorName: string | null
  actorAvatar: string | null
  content: string | null
  permalink: string | null
  itemCreatedAt: Date
  /**
   * When the notification references a post we published, the platform
   * post id. Lets the poller link `inbox_items.postPlatformId` back to
   * the right `post_platforms` row.
   */
  referencedPlatformPostId: string | null
}

export type InboxAccountCtx = {
  id: string
  platform: 'bluesky' | 'mastodon'
  accessToken: string
  refreshToken: string | null
  metadata: Record<string, unknown>
  accountHandle: string
}

export type InboxAdapter = {
  fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]>
}
