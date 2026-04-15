import type { InboxAccountCtx, InboxFetchItem, InboxKind } from './types'

const API = 'https://api.tumblr.com/v2'

type NotesResponse = {
  response?: {
    notes?: Array<{
      type: 'like' | 'reblog' | 'reply' | 'answer' | 'conversational_note'
      timestamp: number
      blog_name?: string
      blog_uuid?: string
      avatar_shape?: string
      reply_text?: string
      added_text?: string
      post_id?: string
      post_url?: string
    }>
  }
}

function blog(ctx: InboxAccountCtx): string {
  return (ctx.metadata.blog as string | undefined) ?? ctx.accountHandle
}

function mapKind(t: NonNullable<NotesResponse['response']>['notes'] extends Array<infer N> ? (N extends { type: infer T } ? T : never) : never): InboxKind | null {
  if (t === 'reply' || t === 'conversational_note' || t === 'answer') return 'reply'
  if (t === 'reblog') return 'repost'
  if (t === 'like') return 'like'
  return null
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const items: InboxFetchItem[] = []
  for (const postId of ctx.publishedPlatformPostIds.slice(0, 20)) {
    const res = await fetch(
      `${API}/blog/${blog(ctx)}/notes?id=${encodeURIComponent(postId)}&mode=all`,
      { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
    )
    if (!res.ok) continue
    const json = (await res.json()) as NotesResponse
    for (const n of json.response?.notes ?? []) {
      const kind = mapKind(n.type as never)
      if (!kind) continue
      // Dedup: blog_uuid + post_id + timestamp is a decent natural key.
      const key = `${postId}:${n.blog_uuid ?? n.blog_name}:${n.type}:${n.timestamp}`
      items.push({
        platformItemId: key,
        kind,
        actorHandle: n.blog_name ?? null,
        actorName: n.blog_name ?? null,
        actorAvatar: n.blog_name
          ? `https://api.tumblr.com/v2/blog/${n.blog_name}/avatar/64`
          : null,
        content: n.reply_text ?? n.added_text ?? null,
        permalink: n.post_url ?? null,
        itemCreatedAt: new Date(n.timestamp * 1000),
        referencedPlatformPostId: postId,
      })
    }
  }
  return items
}
