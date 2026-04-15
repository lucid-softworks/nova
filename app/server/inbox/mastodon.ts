import type { InboxAccountCtx, InboxFetchItem, InboxKind } from './types'

type MastodonNotification = {
  id: string
  type:
    | 'mention'
    | 'status'
    | 'reblog'
    | 'follow'
    | 'follow_request'
    | 'favourite'
    | 'poll'
    | 'update'
  created_at: string
  account?: {
    id: string
    acct: string
    display_name?: string
    avatar?: string
  }
  status?: {
    id: string
    content?: string
    url?: string
    in_reply_to_id?: string | null
  }
}

function mapKind(t: MastodonNotification['type']): InboxKind | null {
  switch (t) {
    case 'mention':
      return 'mention'
    case 'favourite':
      return 'like'
    case 'reblog':
      return 'repost'
    case 'follow':
      return 'follow'
    default:
      return null
  }
}

function instanceBase(ctx: InboxAccountCtx): string | null {
  const raw = (ctx.metadata.instance as string | undefined) ?? ''
  if (!raw) return null
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

function stripTags(html: string | undefined): string | null {
  if (!html) return null
  return html.replace(/<[^>]+>/g, '').trim()
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const base = instanceBase(ctx)
  if (!base) return []
  const res = await fetch(`${base}/api/v1/notifications?limit=40`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  })
  if (!res.ok) return []
  const json = (await res.json()) as MastodonNotification[]
  const items: InboxFetchItem[] = []
  for (const n of json) {
    const kind = mapKind(n.type)
    if (!kind) continue
    items.push({
      platformItemId: n.id,
      kind,
      actorHandle: n.account?.acct ?? null,
      actorName: n.account?.display_name ?? null,
      actorAvatar: n.account?.avatar ?? null,
      content: stripTags(n.status?.content),
      permalink: n.status?.url ?? null,
      itemCreatedAt: new Date(n.created_at),
      // For mentions/favourites/reblogs on our post, status.in_reply_to_id
      // points at our status id (the reply's parent). That's the join key.
      referencedPlatformPostId: n.status?.in_reply_to_id ?? n.status?.id ?? null,
    })
  }
  return items
}
