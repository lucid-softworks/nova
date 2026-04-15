import type { InboxAccountCtx, InboxFetchItem } from './types'

const REST = 'https://api.linkedin.com/rest'

type CommentsResponse = {
  elements?: Array<{
    id: string
    actor?: string
    message?: { text?: string }
    createdAt?: number
    '$URN'?: string
  }>
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': '202401',
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const items: InboxFetchItem[] = []
  for (const shareUrn of ctx.publishedPlatformPostIds.slice(0, 20)) {
    const encoded = encodeURIComponent(shareUrn)
    const res = await fetch(
      `${REST}/socialActions/${encoded}/comments?count=20`,
      { headers: headers(ctx.accessToken) },
    )
    if (!res.ok) continue
    const json = (await res.json()) as CommentsResponse
    for (const c of json.elements ?? []) {
      items.push({
        platformItemId: c['$URN'] ?? c.id,
        kind: 'reply',
        actorHandle: null,
        actorName: c.actor ?? null,
        actorAvatar: null,
        content: c.message?.text ?? null,
        permalink: `https://www.linkedin.com/feed/update/${encodeURIComponent(shareUrn)}/`,
        itemCreatedAt: c.createdAt ? new Date(c.createdAt) : new Date(),
        referencedPlatformPostId: shareUrn,
      })
    }
  }
  return items
}
