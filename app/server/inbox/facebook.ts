import type { InboxAccountCtx, InboxFetchItem } from './types'

const GRAPH = 'https://graph.facebook.com/v19.0'

type CommentsResponse = {
  data?: Array<{
    id: string
    from?: { id: string; name: string }
    message?: string
    created_time?: string
    permalink_url?: string
  }>
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const items: InboxFetchItem[] = []
  const params = new URLSearchParams()
  params.set('fields', 'id,from,message,created_time,permalink_url')
  params.set('access_token', ctx.accessToken)
  for (const postId of ctx.publishedPlatformPostIds.slice(0, 25)) {
    const res = await fetch(`${GRAPH}/${postId}/comments?${params.toString()}`)
    if (!res.ok) continue
    const json = (await res.json()) as CommentsResponse
    for (const c of json.data ?? []) {
      items.push({
        platformItemId: c.id,
        kind: 'reply',
        actorHandle: c.from?.name ?? null,
        actorName: c.from?.name ?? null,
        actorAvatar: c.from?.id
          ? `${GRAPH}/${c.from.id}/picture?type=square`
          : null,
        content: c.message ?? null,
        permalink: c.permalink_url ?? null,
        itemCreatedAt: c.created_time ? new Date(c.created_time) : new Date(),
        referencedPlatformPostId: postId,
      })
    }
  }
  return items
}
