import type { InboxAccountCtx, InboxFetchItem } from './types'

const GRAPH = 'https://graph.facebook.com/v19.0'

type CommentsResponse = {
  data?: Array<{
    id: string
    username?: string
    text?: string
    timestamp?: string
  }>
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const items: InboxFetchItem[] = []
  const params = new URLSearchParams()
  params.set('fields', 'id,username,text,timestamp')
  params.set('access_token', ctx.accessToken)
  for (const mediaId of ctx.publishedPlatformPostIds.slice(0, 25)) {
    const res = await fetch(`${GRAPH}/${mediaId}/comments?${params.toString()}`)
    if (!res.ok) continue
    const json = (await res.json()) as CommentsResponse
    for (const c of json.data ?? []) {
      items.push({
        platformItemId: c.id,
        kind: 'reply',
        actorHandle: c.username ?? null,
        actorName: c.username ?? null,
        actorAvatar: null,
        content: c.text ?? null,
        permalink: `https://www.instagram.com/p/${mediaId}/c/${c.id}`,
        itemCreatedAt: c.timestamp ? new Date(c.timestamp) : new Date(),
        referencedPlatformPostId: mediaId,
      })
    }
  }
  return items
}
