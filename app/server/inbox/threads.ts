import type { InboxAccountCtx, InboxFetchItem } from './types'

const API = 'https://graph.threads.net/v1.0'

type RepliesResponse = {
  data?: Array<{
    id: string
    username?: string
    text?: string
    permalink?: string
    timestamp?: string
  }>
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const items: InboxFetchItem[] = []
  const params = new URLSearchParams()
  params.set('fields', 'id,username,text,permalink,timestamp')
  params.set('access_token', ctx.accessToken)
  for (const threadId of ctx.publishedPlatformPostIds.slice(0, 25)) {
    const res = await fetch(`${API}/${threadId}/replies?${params.toString()}`)
    if (!res.ok) continue
    const json = (await res.json()) as RepliesResponse
    for (const r of json.data ?? []) {
      items.push({
        platformItemId: r.id,
        kind: 'reply',
        actorHandle: r.username ?? null,
        actorName: r.username ?? null,
        actorAvatar: null,
        content: r.text ?? null,
        permalink: r.permalink ?? null,
        itemCreatedAt: r.timestamp ? new Date(r.timestamp) : new Date(),
        referencedPlatformPostId: threadId,
      })
    }
  }
  return items
}
