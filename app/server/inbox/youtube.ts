import type { InboxAccountCtx, InboxFetchItem } from './types'

const API = 'https://www.googleapis.com/youtube/v3'

type CommentThread = {
  id: string
  snippet?: {
    topLevelComment?: {
      id: string
      snippet?: {
        authorDisplayName?: string
        authorProfileImageUrl?: string
        authorChannelUrl?: string
        textDisplay?: string
        publishedAt?: string
      }
    }
    videoId?: string
  }
}

type ThreadsResponse = { items?: CommentThread[] }

function handleFromAuthorUrl(url: string | undefined): string | null {
  if (!url) return null
  const m = /\/(channel|user|c|@)\/?([^/?#]+)/.exec(url)
  return m ? `@${m[2]}` : null
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const items: InboxFetchItem[] = []
  // Fan out over the most recent videos we published via this account.
  // YouTube has no account-level "notifications" API with OAuth access;
  // per-video commentThreads is the path.
  for (const videoId of ctx.publishedPlatformPostIds.slice(0, 20)) {
    const url = new URL(`${API}/commentThreads`)
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('videoId', videoId)
    url.searchParams.set('maxResults', '20')
    url.searchParams.set('order', 'time')
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    })
    if (!res.ok) continue
    const json = (await res.json()) as ThreadsResponse
    for (const t of json.items ?? []) {
      const top = t.snippet?.topLevelComment
      const s = top?.snippet
      if (!top || !s) continue
      items.push({
        platformItemId: top.id,
        kind: 'reply',
        actorHandle: handleFromAuthorUrl(s.authorChannelUrl),
        actorName: s.authorDisplayName ?? null,
        actorAvatar: s.authorProfileImageUrl ?? null,
        content: s.textDisplay ?? null,
        permalink: videoId
          ? `https://youtube.com/watch?v=${videoId}&lc=${top.id}`
          : null,
        itemCreatedAt: s.publishedAt ? new Date(s.publishedAt) : new Date(),
        referencedPlatformPostId: videoId ?? null,
      })
    }
  }
  return items
}
