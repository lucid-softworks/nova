import { safeFetch } from '~/lib/safe-fetch'

const SEARCH_URL = 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts'

export type BlueskySearchHit = {
  uri: string
  cid: string
  authorDid: string
  authorHandle: string
  authorName: string | null
  authorAvatar: string | null
  content: string
  publishedAt: string | null
  postUrl: string
}

type ApiPost = {
  uri: string
  cid: string
  author: {
    did: string
    handle: string
    displayName?: string
    avatar?: string
  }
  record: { text?: string; createdAt?: string }
}

/**
 * Hit Bluesky's public search API. No auth needed. Returns up to 100 posts
 * matching the query, most-recent first. We filter by `since` to avoid
 * re-processing already-seen rows.
 */
export async function searchBluesky(term: string, sinceIso: string | null): Promise<BlueskySearchHit[]> {
  const url = new URL(SEARCH_URL)
  url.searchParams.set('q', term)
  url.searchParams.set('limit', '100')
  url.searchParams.set('sort', 'latest')
  if (sinceIso) url.searchParams.set('since', sinceIso)
  const res = await safeFetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Bluesky search ${res.status}`)
  }
  const json = (await res.json()) as { posts: ApiPost[] }
  return json.posts.map((p) => {
    const rkey = p.uri.split('/').pop() ?? p.uri
    return {
      uri: p.uri,
      cid: p.cid,
      authorDid: p.author.did,
      authorHandle: p.author.handle,
      authorName: p.author.displayName ?? null,
      authorAvatar: p.author.avatar ?? null,
      content: p.record.text ?? '',
      publishedAt: p.record.createdAt ?? null,
      postUrl: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
    }
  })
}
