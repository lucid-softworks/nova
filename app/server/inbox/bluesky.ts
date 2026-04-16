import type { InboxAccountCtx, InboxFetchItem, InboxKind } from './types'

const PLC_DIRECTORY = 'https://plc.directory'

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

async function resolvePds(did: string): Promise<string> {
  const res = await fetch(`${PLC_DIRECTORY}/${encodeURIComponent(did)}`)
  if (!res.ok) return 'https://bsky.social'
  const doc = (await res.json()) as {
    service?: Array<{ id: string; serviceEndpoint: string }>
  }
  const pds = doc.service?.find((s) => s.id === '#atproto_pds')
  return pds?.serviceEndpoint?.replace(/\/+$/, '') ?? 'https://bsky.social'
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const did = (ctx.metadata.did as string) ?? ''
  const pdsUrl = did ? await resolvePds(did) : 'https://bsky.social'

  const res = await fetch(
    `${pdsUrl}/xrpc/app.bsky.notification.listNotifications?limit=50`,
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
