import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { encrypt } from '~/lib/encryption'
import { PublishError } from '../errors'
import { loadMediaBuffer } from '../helpers'
import type { PublishContext, PublishMedia, PublishResult } from '../index'

const SERVICE = 'https://bsky.social'
const MAX_GRAPHEMES = 300

type Session = { did: string; accessJwt: string; refreshJwt: string }

async function refreshSession(refreshJwt: string): Promise<Session> {
  const res = await fetch(`${SERVICE}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshJwt}` },
  })
  if (!res.ok) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: `Bluesky refreshSession failed (${res.status})`,
      userMessage: 'Bluesky session expired — reconnect your account.',
      retryable: false,
    })
  }
  const json = (await res.json()) as { did: string; accessJwt: string; refreshJwt: string }
  return { did: json.did, accessJwt: json.accessJwt, refreshJwt: json.refreshJwt }
}

async function xrpc<T>(
  method: 'GET' | 'POST',
  nsid: string,
  session: Session,
  body?: unknown,
): Promise<T> {
  const url = `${SERVICE}/xrpc/${nsid}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessJwt}`,
    Accept: 'application/json',
  }
  if (method === 'POST' && body !== undefined) headers['Content-Type'] = 'application/json'

  const init: RequestInit = { method, headers }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await fetch(url, init)
  if (!res.ok) {
    const txt = await res.text()
    if (res.status === 401) {
      throw new PublishError({
        code: 'AUTH_EXPIRED',
        message: `Bluesky ${nsid} 401`,
        userMessage: 'Bluesky session expired — reconnect your account.',
        retryable: false,
      })
    }
    if (res.status === 429) {
      throw new PublishError({
        code: 'RATE_LIMITED',
        message: `Bluesky rate limited on ${nsid}`,
        userMessage: 'Bluesky is rate limiting us — will retry shortly.',
        retryable: true,
      })
    }
    throw new PublishError({
      code: 'UNKNOWN',
      message: `Bluesky ${nsid} ${res.status}: ${txt.slice(0, 400)}`,
      userMessage: 'Bluesky publish failed.',
    })
  }
  return (await res.json()) as T
}

type BlobRef = { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }

async function uploadImages(
  session: Session,
  media: PublishMedia[],
): Promise<Array<{ alt: string; image: BlobRef }>> {
  const images: Array<{ alt: string; image: BlobRef }> = []
  for (const m of media.slice(0, 4)) {
    if (!m.mimeType.startsWith('image/')) continue
    const { buf, mime } = await loadMediaBuffer(m)
    const res = await fetch(`${SERVICE}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        'Content-Type': mime,
      },
      body: new Uint8Array(buf),
    })
    if (!res.ok) {
      const txt = await res.text()
      if (res.status === 401) {
        throw new PublishError({
          code: 'AUTH_EXPIRED',
          message: `uploadBlob 401`,
          userMessage: 'Bluesky session expired — reconnect.',
          retryable: false,
        })
      }
      throw new PublishError({
        code: res.status === 413 ? 'MEDIA_TOO_LARGE' : 'UNKNOWN',
        message: `uploadBlob ${res.status}: ${txt.slice(0, 300)}`,
        userMessage: 'Bluesky rejected one of the images.',
      })
    }
    const json = (await res.json()) as { blob: BlobRef }
    images.push({ alt: m.originalName, image: json.blob })
  }
  return images
}

type CreateRecordResponse = { uri: string; cid: string }

async function createPost(
  session: Session,
  text: string,
  images: Array<{ alt: string; image: BlobRef }>,
  reply?: { root: { uri: string; cid: string }; parent: { uri: string; cid: string } },
): Promise<CreateRecordResponse> {
  if (graphemeCount(text) > MAX_GRAPHEMES) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'Bluesky post exceeds 300 graphemes',
      userMessage: 'This post is too long for Bluesky (300 character limit).',
      retryable: false,
    })
  }
  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    langs: ['en'],
  }
  if (images.length > 0) {
    record.embed = { $type: 'app.bsky.embed.images', images }
  }
  if (reply) record.reply = reply
  return xrpc<CreateRecordResponse>('POST', 'com.atproto.repo.createRecord', session, {
    repo: session.did,
    collection: 'app.bsky.feed.post',
    record,
  })
}

function graphemeCount(s: string): number {
  try {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' })
    let n = 0
    for (const _ of seg.segment(s)) {
      void _
      n++
    }
    return n
  } catch {
    return [...s].length
  }
}

async function resolveAtUriToRef(
  session: Session,
  atUri: string,
): Promise<{ uri: string; cid: string } | null> {
  // Parse at://<did>/<collection>/<rkey>
  const m = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(atUri)
  if (!m) return null
  const [, repo, collection, rkey] = m
  const url = new URL(`${SERVICE}/xrpc/com.atproto.repo.getRecord`)
  url.searchParams.set('repo', repo!)
  url.searchParams.set('collection', collection!)
  url.searchParams.set('rkey', rkey!)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { uri?: string; cid?: string }
  if (!json.uri || !json.cid) return null
  return { uri: json.uri, cid: json.cid }
}

function aturiToPublicUrl(did: string, uri: string): string {
  const rkey = uri.split('/').pop()
  return `https://bsky.app/profile/${did}/post/${rkey}`
}

async function persistRefreshed(accountId: string, session: Session) {
  await db
    .update(schema.socialAccounts)
    .set({
      accessToken: encrypt(session.accessJwt),
      refreshToken: encrypt(session.refreshJwt),
      lastSyncedAt: new Date(),
    })
    .where(eq(schema.socialAccounts.id, accountId))
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const did = (ctx.account.metadata.did as string) ?? ''
  if (!did) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'Bluesky account missing did',
      userMessage: 'Bluesky account not connected properly — reconnect.',
      retryable: false,
    })
  }
  let session: Session = {
    did,
    accessJwt: ctx.account.accessToken,
    refreshJwt: ctx.account.refreshToken ?? '',
  }

  const withRefresh = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof PublishError && err.code === 'AUTH_EXPIRED' && session.refreshJwt) {
        session = await refreshSession(session.refreshJwt)
        await persistRefreshed(ctx.account.id, session)
        return await fn()
      }
      throw err
    }
  }

  const images = await withRefresh(() => uploadImages(session, ctx.media))

  // Reply threading: if the user started this post from an inbox item,
  // fetch the parent record so we can emit a properly-rooted reply.
  // For threads on the AT protocol, `root` must point at the top of
  // the conversation — we approximate by treating the direct parent
  // as root for single-level replies (good enough for mention replies).
  let replyRef:
    | { root: { uri: string; cid: string }; parent: { uri: string; cid: string } }
    | undefined
  const replyTarget = ctx.version.platformVariables.replyToPostId
  if (replyTarget) {
    try {
      const ref = await resolveAtUriToRef(session, replyTarget)
      if (ref) replyRef = { root: ref, parent: ref }
    } catch {
      // Non-fatal: publish as a regular post if the parent lookup fails.
    }
  }
  const first = await withRefresh(() =>
    createPost(session, ctx.version.content, images, replyRef),
  )

  if (ctx.version.isThread && ctx.version.threadParts.length > 1) {
    let parent = { uri: first.uri, cid: first.cid }
    const root = { uri: first.uri, cid: first.cid }
    for (let i = 1; i < ctx.version.threadParts.length; i++) {
      const part = ctx.version.threadParts[i]!
      const next = await withRefresh(() => createPost(session, part.content, [], { root, parent }))
      parent = { uri: next.uri, cid: next.cid }
    }
  }

  return {
    platformPostId: first.uri,
    url: aturiToPublicUrl(session.did, first.uri),
    publishedAt: new Date(),
  }
}
