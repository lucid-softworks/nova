import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { encrypt } from '~/lib/encryption'
import { PublishError } from '../errors'
import { loadMediaBuffer } from '../helpers'
import type { PublishContext, PublishMedia, PublishResult } from '../index'
import { buildFacets, detectRawFacets, type Facet } from './bluesky-facets'
import { fetchLinkPreview } from './bluesky-linkcard'

const ENTRYWAY = 'https://bsky.social'
const PLC_DIRECTORY = 'https://plc.directory'
const MAX_GRAPHEMES = 300

async function resolvePds(did: string): Promise<string> {
  try {
    const res = await fetch(`${PLC_DIRECTORY}/${encodeURIComponent(did)}`)
    if (!res.ok) return ENTRYWAY
    const doc = (await res.json()) as {
      service?: Array<{ id: string; serviceEndpoint: string }>
    }
    const pds = doc.service?.find((s) => s.id === '#atproto_pds')
    return pds?.serviceEndpoint?.replace(/\/+$/, '') ?? ENTRYWAY
  } catch {
    return ENTRYWAY
  }
}

type Session = { did: string; accessJwt: string; refreshJwt: string; pdsUrl: string }

async function refreshSession(pdsUrl: string, refreshJwt: string): Promise<Session> {
  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.refreshSession`, {
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
  return { did: json.did, accessJwt: json.accessJwt, refreshJwt: json.refreshJwt, pdsUrl }
}

async function xrpc<T>(
  method: 'GET' | 'POST',
  nsid: string,
  session: Session,
  body?: unknown,
): Promise<T> {
  const url = `${session.pdsUrl}/xrpc/${nsid}`
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

async function uploadBlob(session: Session, media: PublishMedia): Promise<BlobRef> {
  const { buf, mime } = await loadMediaBuffer(media)
  const res = await fetch(`${session.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`, {
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
      userMessage: 'Bluesky rejected one of the uploads.',
    })
  }
  const json = (await res.json()) as { blob: BlobRef }
  return json.blob
}

async function uploadImages(
  session: Session,
  media: PublishMedia[],
): Promise<Array<{ alt: string; image: BlobRef }>> {
  const images: Array<{ alt: string; image: BlobRef }> = []
  for (const m of media.slice(0, 4)) {
    if (!m.mimeType.startsWith('image/')) continue
    const blob = await uploadBlob(session, m)
    images.push({ alt: m.altText ?? m.originalName, image: blob })
  }
  return images
}

type VideoEmbed = { $type: 'app.bsky.embed.video'; video: BlobRef; alt?: string }

async function uploadVideo(session: Session, media: PublishMedia[]): Promise<VideoEmbed | null> {
  const video = media.find((m) => m.mimeType.startsWith('video/'))
  if (!video) return null
  const blob = await uploadBlob(session, video)
  const embed: VideoEmbed = { $type: 'app.bsky.embed.video', video: blob }
  if (video.altText) embed.alt = video.altText
  return embed
}

type ExternalEmbed = {
  $type: 'app.bsky.embed.external'
  external: { uri: string; title: string; description: string; thumb?: BlobRef }
}

async function uploadBytes(
  session: Session,
  bytes: Uint8Array,
  mime: string,
): Promise<BlobRef | null> {
  try {
    const body = new Blob([bytes as BlobPart], { type: mime })
    const res = await fetch(`${session.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        'Content-Type': mime,
      },
      body,
    })
    if (!res.ok) return null
    const json = (await res.json()) as { blob: BlobRef }
    return json.blob
  } catch {
    return null
  }
}

/**
 * Build an app.bsky.embed.external from the first URL present in the post
 * text. Returns null on any failure so the publisher can fall back to a
 * facet-only link without blowing up the whole post.
 */
async function buildLinkCard(session: Session, text: string): Promise<ExternalEmbed | null> {
  const match = /https?:\/\/[^\s)]+/i.exec(text)
  if (!match) return null
  const preview = await fetchLinkPreview(match[0].replace(/[.,!?;:)]+$/, ''))
  if (!preview) return null
  const embed: ExternalEmbed = {
    $type: 'app.bsky.embed.external',
    external: {
      uri: preview.uri,
      title: preview.title,
      description: preview.description,
    },
  }
  if (preview.imageBytes && preview.imageMime) {
    const blob = await uploadBytes(session, preview.imageBytes, preview.imageMime)
    if (blob) embed.external.thumb = blob
  }
  return embed
}

type CreateRecordResponse = { uri: string; cid: string }

const VALID_LABELS = new Set(['suggestive', 'nudity', 'porn', 'graphic-media'])

async function resolveHandleToDid(session: Session, handle: string): Promise<string | null> {
  try {
    const url = new URL(`${session.pdsUrl}/xrpc/com.atproto.identity.resolveHandle`)
    url.searchParams.set('handle', handle)
    const res = await fetch(url.toString())
    if (!res.ok) return null
    const json = (await res.json()) as { did?: string }
    return json.did ?? null
  } catch {
    return null
  }
}

type RecordRef = { uri: string; cid: string }

async function createPost(
  session: Session,
  text: string,
  images: Array<{ alt: string; image: BlobRef }>,
  video: VideoEmbed | null,
  external: ExternalEmbed | null,
  quote: RecordRef | null,
  labels: string[],
  facets: Facet[],
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
  if (facets.length > 0) record.facets = facets
  // Bluesky embeds are mutually exclusive, with one exception:
  // recordWithMedia lets a quote carry either images or video alongside.
  // Precedence when no quote is attached: video > images > external.
  // When a quote is present, combine it with media if available,
  // otherwise emit a plain record embed.
  const media =
    video != null
      ? video
      : images.length > 0
        ? ({ $type: 'app.bsky.embed.images', images } as const)
        : null
  if (quote && media) {
    record.embed = {
      $type: 'app.bsky.embed.recordWithMedia',
      record: { $type: 'app.bsky.embed.record', record: quote },
      media,
    }
  } else if (quote) {
    record.embed = { $type: 'app.bsky.embed.record', record: quote }
  } else if (media) {
    record.embed = media
  } else if (external) {
    record.embed = external
  }
  const cleanLabels = labels.filter((l) => VALID_LABELS.has(l))
  if (cleanLabels.length > 0) {
    record.labels = {
      $type: 'com.atproto.label.defs#selfLabels',
      values: cleanLabels.map((val) => ({ val })),
    }
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
  const url = new URL(`${session.pdsUrl}/xrpc/com.atproto.repo.getRecord`)
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
  const pdsUrl = await resolvePds(did)
  let session: Session = {
    did,
    accessJwt: ctx.account.accessToken,
    refreshJwt: ctx.account.refreshToken ?? '',
    pdsUrl,
  }

  const withRefresh = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof PublishError && err.code === 'AUTH_EXPIRED' && session.refreshJwt) {
        session = await refreshSession(pdsUrl, session.refreshJwt)
        await persistRefreshed(ctx.account.id, session)
        return await fn()
      }
      throw err
    }
  }

  const video = await withRefresh(() => uploadVideo(session, ctx.media))
  const images = video ? [] : await withRefresh(() => uploadImages(session, ctx.media))

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
  const labelsRaw = (ctx.version.platformVariables.bluesky_labels ?? '') as string
  const labels = labelsRaw ? labelsRaw.split(',').filter(Boolean) : []
  const firstFacets = await buildFacets(detectRawFacets(ctx.version.content), (h) =>
    resolveHandleToDid(session, h),
  )
  // Only try to fetch a link card when no media is attached (otherwise
  // the media embed wins anyway — skip the network round-trip).
  const firstExternal =
    !video && images.length === 0
      ? await withRefresh(() => buildLinkCard(session, ctx.version.content))
      : null
  let quoteRef: RecordRef | null = null
  const quoteTarget = ctx.version.platformVariables.quotePostId
  if (quoteTarget && quoteTarget.startsWith('at://')) {
    try {
      quoteRef = await resolveAtUriToRef(session, quoteTarget)
    } catch {
      // Non-fatal: publish without the quote embed.
    }
  }
  const first = await withRefresh(() =>
    createPost(
      session,
      ctx.version.content,
      images,
      video,
      firstExternal,
      quoteRef,
      labels,
      firstFacets,
      replyRef,
    ),
  )

  if (ctx.version.isThread && ctx.version.threadParts.length > 1) {
    let parent = { uri: first.uri, cid: first.cid }
    const root = { uri: first.uri, cid: first.cid }
    for (let i = 1; i < ctx.version.threadParts.length; i++) {
      const part = ctx.version.threadParts[i]!
      const partFacets = await buildFacets(detectRawFacets(part.content), (h) =>
        resolveHandleToDid(session, h),
      )
      const partExternal = await withRefresh(() => buildLinkCard(session, part.content))
      const next = await withRefresh(() =>
        createPost(session, part.content, [], null, partExternal, null, labels, partFacets, {
          root,
          parent,
        }),
      )
      parent = { uri: next.uri, cid: next.cid }
    }
  }

  return {
    platformPostId: first.uri,
    url: aturiToPublicUrl(session.did, first.uri),
    publishedAt: new Date(),
  }
}
