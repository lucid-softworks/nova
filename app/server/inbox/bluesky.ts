import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { encrypt } from '~/lib/encryption'
import { logger } from '~/lib/logger'
import type { InboxAccountCtx, InboxFetchItem, InboxKind } from './types'

const PLC_DIRECTORY = 'https://plc.directory'

type Notification = {
  uri: string
  cid: string
  author: {
    did: string
    handle: string
    displayName?: string
    avatar?: string
  }
  reason: 'like' | 'repost' | 'follow' | 'mention' | 'reply' | 'quote'
  reasonSubject?: string
  record?: { text?: string; reply?: { parent?: { uri?: string } } }
  indexedAt: string
}

function mapKind(reason: Notification['reason']): InboxKind | null {
  switch (reason) {
    case 'mention':
    case 'quote':
      return 'mention'
    case 'reply':
      return 'reply'
    case 'like':
      return 'like'
    case 'repost':
      return 'repost'
    case 'follow':
      return 'follow'
    default:
      return null
  }
}

function uriToUrl(handle: string, uri: string): string {
  const rkey = uri.split('/').pop()
  return `https://bsky.app/profile/${handle}/post/${rkey}`
}

async function resolvePds(did: string): Promise<string> {
  const res = await fetch(`${PLC_DIRECTORY}/${encodeURIComponent(did)}`)
  if (!res.ok) return 'https://bsky.social'
  const doc = (await res.json()) as {
    service?: Array<{ id: string; serviceEndpoint: string }>
  }
  const pds = doc.service?.find((s) => s.id === '#atproto_pds')
  return pds?.serviceEndpoint?.replace(/\/+$/, '') ?? 'https://bsky.social'
}

async function refreshAndPersist(
  pdsUrl: string,
  accountId: string,
  refreshJwt: string,
): Promise<string | null> {
  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshJwt}` },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { accessJwt: string; refreshJwt: string }
  await db
    .update(schema.socialAccounts)
    .set({
      accessToken: encrypt(json.accessJwt),
      refreshToken: encrypt(json.refreshJwt),
      lastSyncedAt: new Date(),
    })
    .where(eq(schema.socialAccounts.id, accountId))
  return json.accessJwt
}

export async function fetchInbox(ctx: InboxAccountCtx): Promise<InboxFetchItem[]> {
  // Use bsky.social (the entryway) for AppView-proxied calls like
  // listNotifications. The entryway forwards to the user's actual PDS
  // and then to the AppView — calling the PDS directly 502s when the
  // PDS can't reach the AppView on its own.
  const entryway = 'https://bsky.social'

  let token = ctx.accessToken
  if (ctx.refreshToken) {
    logger.info({ accountId: ctx.id }, 'refreshing bluesky token via entryway')
    const fresh = await refreshAndPersist(entryway, ctx.id, ctx.refreshToken)
    if (fresh) {
      token = fresh
      logger.info({ accountId: ctx.id }, 'bluesky token refreshed')
    } else {
      logger.warn({ accountId: ctx.id }, 'bluesky token refresh returned null')
    }
  } else {
    logger.warn({ accountId: ctx.id, hasAccess: !!ctx.accessToken }, 'no bluesky refresh token')
  }

  const res = await fetch(
    `${entryway}/xrpc/app.bsky.notification.listNotifications?limit=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    logger.warn(
      { status: res.status, platform: 'bluesky', accountId: ctx.id },
      'bluesky listNotifications failed',
    )
    return []
  }
  const json = (await res.json()) as { notifications?: Notification[] }
  const items: InboxFetchItem[] = []
  for (const n of json.notifications ?? []) {
    const kind = mapKind(n.reason)
    if (!kind) continue
    const referenced = n.reasonSubject ?? n.record?.reply?.parent?.uri ?? null
    items.push({
      platformItemId: `${n.uri}:${n.reason}`,
      kind,
      actorHandle: n.author.handle,
      actorName: n.author.displayName ?? null,
      actorAvatar: n.author.avatar ?? null,
      content: n.record?.text ?? null,
      permalink: uriToUrl(n.author.handle, n.uri),
      itemCreatedAt: new Date(n.indexedAt),
      referencedPlatformPostId: referenced,
    })
  }
  return items
}
