import type { InboxAccountCtx, InboxFetchItem, InboxKind } from './types'

const API = 'https://oauth.reddit.com'

type Listing = {
  data?: {
    children?: Array<{
      kind: string
      data?: {
        id: string
        name: string
        author?: string
        body?: string
        subject?: string
        link_title?: string
        context?: string
        subreddit?: string
        created_utc?: number
        type?: string
        parent_id?: string
        was_comment?: boolean
      }
    }>
  }
}

function mapKind(d: NonNullable<NonNullable<Listing['data']>['children']>[number]['data']): InboxKind {
  const t = d?.type
  if (t === 'username_mention') return 'mention'
  if (t === 'comment_reply' || t === 'post_reply') return 'reply'
  return 'dm'
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const ua =
    (ctx.metadata.userAgent as string | undefined) ??
    `nova:v1 (by /u/${ctx.accountHandle})`
  const res = await fetch(`${API}/message/inbox?limit=50`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}`, 'User-Agent': ua },
  })
  if (!res.ok) return []
  const json = (await res.json()) as Listing
  const items: InboxFetchItem[] = []
  for (const c of json.data?.children ?? []) {
    const d = c.data
    if (!d) continue
    const created = d.created_utc ? new Date(d.created_utc * 1000) : new Date()
    items.push({
      platformItemId: d.name,
      kind: mapKind(d),
      actorHandle: d.author ?? null,
      actorName: d.author ?? null,
      actorAvatar: null,
      content: d.body ?? d.subject ?? d.link_title ?? null,
      permalink: d.context ? `https://www.reddit.com${d.context}` : null,
      itemCreatedAt: created,
      // Reddit's parent_id for replies looks like t3_xxx (submission) or t1_xxx (comment).
      // The submission id is what our post_platforms stores, so prefer that.
      referencedPlatformPostId: d.parent_id?.startsWith('t3_') ? d.parent_id : null,
    })
  }
  return items
}
