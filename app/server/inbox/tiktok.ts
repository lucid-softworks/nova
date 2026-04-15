import type { InboxAccountCtx, InboxFetchItem } from './types'

// Business-only — Direct Messages API is not available on personal TikTok
// accounts. Requires a TikTok Business account with the DM scope granted
// and a business_id stored in metadata at connect time.
const API = 'https://business-api.tiktok.com/open_api/v1.3'

type ListResponse = {
  code?: number
  data?: {
    list?: Array<{
      message_id: string
      conversation_id?: string
      sender_id?: string
      sender_name?: string
      sender_avatar_url?: string
      content?: string
      content_type?: string
      timestamp?: number | string
    }>
  }
}

function businessId(ctx: InboxAccountCtx): string | null {
  const m =
    (ctx.metadata.businessId as string | undefined) ??
    (ctx.metadata.business_id as string | undefined) ??
    null
  return typeof m === 'string' && m ? m : null
}

function parseTimestamp(v: number | string | undefined): Date {
  if (!v) return new Date()
  if (typeof v === 'number') return new Date(v * (v > 1e12 ? 1 : 1000))
  const n = Number(v)
  if (!Number.isNaN(n)) return new Date(n * (n > 1e12 ? 1 : 1000))
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  const bid = businessId(ctx)
  if (!bid) return []
  const url = new URL(`${API}/business/messages/list/`)
  url.searchParams.set('business_id', bid)
  url.searchParams.set('count', '50')
  const res = await fetch(url.toString(), {
    headers: {
      'Access-Token': ctx.accessToken,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) return []
  const json = (await res.json()) as ListResponse
  if (json.code && json.code !== 0) return []
  const items: InboxFetchItem[] = []
  for (const m of json.data?.list ?? []) {
    // Skip messages we sent ourselves back to the user.
    if (m.sender_id && m.sender_id === bid) continue
    items.push({
      platformItemId: m.message_id,
      kind: 'dm',
      actorHandle: m.sender_name ?? m.sender_id ?? null,
      actorName: m.sender_name ?? null,
      actorAvatar: m.sender_avatar_url ?? null,
      content: m.content ?? null,
      permalink: m.conversation_id
        ? `https://www.tiktok.com/business/messages/${m.conversation_id}`
        : null,
      itemCreatedAt: parseTimestamp(m.timestamp),
      referencedPlatformPostId: null,
    })
  }
  return items
}
