import type { InboxAccountCtx, InboxFetchItem } from './types'

const API = 'https://api.twitter.com/2'

type MentionsResponse = {
  data?: Array<{
    id: string
    text: string
    author_id: string
    created_at: string
    in_reply_to_user_id?: string
    referenced_tweets?: Array<{ type: 'replied_to' | 'quoted' | 'retweeted'; id: string }>
  }>
  includes?: {
    users?: Array<{ id: string; username: string; name: string; profile_image_url?: string }>
  }
}

async function userId(ctx: InboxAccountCtx): Promise<string | null> {
  const m = ctx.metadata.userId ?? ctx.metadata.id
  if (typeof m === 'string' && m) return m
  const res = await fetch(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  })
  if (!res.ok) return null
  const j = (await res.json()) as { data?: { id?: string } }
  return j.data?.id ?? null
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const id = await userId(ctx)
  if (!id) return []
  const url = new URL(`${API}/users/${id}/mentions`)
  url.searchParams.set('max_results', '50')
  url.searchParams.set('tweet.fields', 'created_at,author_id,in_reply_to_user_id,referenced_tweets')
  url.searchParams.set('expansions', 'author_id')
  url.searchParams.set('user.fields', 'username,name,profile_image_url')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  })
  if (!res.ok) return []
  const json = (await res.json()) as MentionsResponse
  const users = new Map(
    (json.includes?.users ?? []).map((u) => [u.id, u] as const),
  )
  const items: InboxFetchItem[] = []
  for (const t of json.data ?? []) {
    const author = users.get(t.author_id)
    const repliedTo = t.referenced_tweets?.find((r) => r.type === 'replied_to')?.id
    const kind = repliedTo ? 'reply' : 'mention'
    items.push({
      platformItemId: t.id,
      kind,
      actorHandle: author?.username ?? null,
      actorName: author?.name ?? null,
      actorAvatar: author?.profile_image_url ?? null,
      content: t.text,
      permalink: author ? `https://twitter.com/${author.username}/status/${t.id}` : null,
      itemCreatedAt: new Date(t.created_at),
      referencedPlatformPostId: repliedTo ?? null,
    })
  }
  return items
}
