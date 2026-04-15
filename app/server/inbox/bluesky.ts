import type { InboxAccountCtx, InboxFetchItem, InboxKind } from './types'

const SERVICE = 'https://bsky.social'

type Notification = {
  uri: string
  cid: string
  author: {
    did: string
    handle: string
    displayName?: string
    avatar?: string
  }
  reason: 'like' | 'repost' | 'follow' | 'mention' | 'reply' | 'quote'
  reasonSubject?: string
  record?: { text?: string; reply?: { parent?: { uri?: string } } }
  indexedAt: string
}

function mapKind(reason: Notification['reason']): InboxKind | null {
  switch (reason) {
    case 'mention':
    case 'quote':
      return 'mention'
    case 'reply':
      return 'reply'
    case 'like':
      return 'like'
    case 'repost':
      return 'repost'
    case 'follow':
      return 'follow'
    default:
      return null
  }
}

function uriToUrl(handle: string, uri: string): string {
  const rkey = uri.split('/').pop()
  return `https://bsky.app/profile/${handle}/post/${rkey}`
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const res = await fetch(
    `${SERVICE}/xrpc/app.bsky.notification.listNotifications?limit=50`,
    { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
  )
  if (!res.ok) return []
  const json = (await res.json()) as { notifications?: Notification[] }
  const items: InboxFetchItem[] = []
  for (const n of json.notifications ?? []) {
    const kind = mapKind(n.reason)
    if (!kind) continue
    const referenced = n.reasonSubject ?? n.record?.reply?.parent?.uri ?? null
    items.push({
      platformItemId: `${n.uri}:${n.reason}`,
      kind,
      actorHandle: n.author.handle,
      actorName: n.author.displayName ?? null,
      actorAvatar: n.author.avatar ?? null,
      content: n.record?.text ?? null,
      permalink: uriToUrl(n.author.handle, n.uri),
      itemCreatedAt: new Date(n.indexedAt),
      referencedPlatformPostId: referenced,
    })
  }
  return items
}
