import { PublishError } from '../errors'
import { loadMediaBuffer, persistRefreshedTokens } from '../helpers'
import type { PublishContext, PublishMedia, PublishResult } from '../index'

const API = 'https://api.twitter.com'
const UPLOAD = 'https://upload.twitter.com/1.1/media/upload.json'

type Tokens = { accessToken: string; refreshToken: string | null }

async function refreshTokens(refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
}> {
  const clientId = process.env.X_CLIENT_ID
  if (!clientId) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'X_CLIENT_ID not configured',
      userMessage: 'X integration is misconfigured — contact support.',
      retryable: false,
    })
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })
  const res = await fetch(`${API}/2/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: `X token refresh failed (${res.status})`,
      userMessage: 'X session expired — reconnect your account.',
      retryable: false,
    })
  }
  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
  }
}

function httpError(status: number, where: string, body: string): PublishError {
  if (status === 401) {
    return new PublishError({
      code: 'AUTH_EXPIRED',
      message: `X ${where} 401`,
      userMessage: 'X session expired — reconnect your account.',
      retryable: false,
    })
  }
  if (status === 429) {
    return new PublishError({
      code: 'RATE_LIMITED',
      message: `X rate limited on ${where}`,
      userMessage: 'X is rate limiting us — will retry shortly.',
      retryable: true,
    })
  }
  if (status === 413) {
    return new PublishError({
      code: 'MEDIA_TOO_LARGE',
      message: `X ${where} 413`,
      userMessage: 'Media file is too large for X.',
      retryable: false,
    })
  }
  return new PublishError({
    code: 'UNKNOWN',
    message: `X ${where} ${status}: ${body.slice(0, 400)}`,
    userMessage: 'X publish failed.',
  })
}

async function uploadSimpleImage(tokens: Tokens, m: PublishMedia): Promise<string> {
  const { buf, mime } = await loadMediaBuffer(m)
  const form = new FormData()
  form.append('media', new Blob([new Uint8Array(buf)], { type: mime }), m.originalName)
  const res = await fetch(UPLOAD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
    body: form,
  })
  if (!res.ok) throw httpError(res.status, 'media/upload', await res.text())
  const json = (await res.json()) as { media_id_string: string }
  return json.media_id_string
}

async function uploadVideo(tokens: Tokens, m: PublishMedia): Promise<string> {
  const { buf, mime } = await loadMediaBuffer(m)
  const auth = { Authorization: `Bearer ${tokens.accessToken}` }

  const initForm = new URLSearchParams({
    command: 'INIT',
    total_bytes: String(buf.length),
    media_type: mime,
    media_category: mime.startsWith('video/') ? 'tweet_video' : 'tweet_gif',
  })
  const initRes = await fetch(UPLOAD, { method: 'POST', headers: auth, body: initForm })
  if (!initRes.ok) throw httpError(initRes.status, 'media/upload INIT', await initRes.text())
  const { media_id_string: mediaId } = (await initRes.json()) as { media_id_string: string }

  const CHUNK = 5 * 1024 * 1024
  let segment = 0
  for (let offset = 0; offset < buf.length; offset += CHUNK) {
    const chunk = buf.subarray(offset, Math.min(offset + CHUNK, buf.length))
    const form = new FormData()
    form.append('command', 'APPEND')
    form.append('media_id', mediaId)
    form.append('segment_index', String(segment))
    form.append('media', new Blob([new Uint8Array(chunk)], { type: mime }))
    const res = await fetch(UPLOAD, { method: 'POST', headers: auth, body: form })
    if (!res.ok) throw httpError(res.status, 'media/upload APPEND', await res.text())
    segment++
  }

  const finalizeForm = new URLSearchParams({ command: 'FINALIZE', media_id: mediaId })
  const finRes = await fetch(UPLOAD, { method: 'POST', headers: auth, body: finalizeForm })
  if (!finRes.ok) throw httpError(finRes.status, 'media/upload FINALIZE', await finRes.text())
  const finJson = (await finRes.json()) as {
    processing_info?: { state: string; check_after_secs?: number; error?: { message?: string } }
  }

  let info = finJson.processing_info
  while (info && (info.state === 'pending' || info.state === 'in_progress')) {
    await new Promise((r) => setTimeout(r, (info?.check_after_secs ?? 2) * 1000))
    const statusRes = await fetch(
      `${UPLOAD}?command=STATUS&media_id=${encodeURIComponent(mediaId)}`,
      { headers: auth },
    )
    if (!statusRes.ok) throw httpError(statusRes.status, 'media/upload STATUS', await statusRes.text())
    const sJson = (await statusRes.json()) as {
      processing_info?: { state: string; check_after_secs?: number; error?: { message?: string } }
    }
    info = sJson.processing_info
  }
  if (info && info.state === 'failed') {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: `X media processing failed: ${info.error?.message ?? 'unknown'}`,
      userMessage: 'X could not process this video.',
      retryable: false,
    })
  }
  return mediaId
}

async function uploadMedia(tokens: Tokens, media: PublishMedia[]): Promise<string[]> {
  const ids: string[] = []
  for (const m of media.slice(0, 4)) {
    if (m.mimeType.startsWith('image/')) {
      ids.push(await uploadSimpleImage(tokens, m))
    } else if (m.mimeType.startsWith('video/') || m.mimeType === 'image/gif') {
      ids.push(await uploadVideo(tokens, m))
    }
  }
  return ids
}

async function createTweet(
  tokens: Tokens,
  text: string,
  mediaIds: string[],
  replyTo: string | null,
): Promise<string> {
  const body: Record<string, unknown> = { text }
  if (mediaIds.length > 0) body.media = { media_ids: mediaIds }
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo }
  const res = await fetch(`${API}/2/tweets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw httpError(res.status, '2/tweets', await res.text())
  const json = (await res.json()) as { data: { id: string; text: string } }
  return json.data.id
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const tokens: Tokens = {
    accessToken: ctx.account.accessToken,
    refreshToken: ctx.account.refreshToken,
  }

  const withRefresh = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof PublishError && err.code === 'AUTH_EXPIRED' && tokens.refreshToken) {
        const next = await refreshTokens(tokens.refreshToken)
        tokens.accessToken = next.accessToken
        tokens.refreshToken = next.refreshToken
        await persistRefreshedTokens(ctx.account.id, {
          accessToken: next.accessToken,
          refreshToken: next.refreshToken,
          expiresAt: next.expiresAt,
        })
        return await fn()
      }
      throw err
    }
  }

  const mediaById = new Map(ctx.media.map((m) => [m.id, m]))
  const rootMedia = ctx.version.isThread
    ? (ctx.version.threadParts[0]?.mediaIds ?? ctx.version.mediaIds)
        .map((id) => mediaById.get(id))
        .filter((m): m is PublishMedia => !!m)
    : ctx.media
  const rootMediaIds = await withRefresh(() => uploadMedia(tokens, rootMedia))

  const rootText = ctx.version.isThread
    ? (ctx.version.threadParts[0]?.content ?? ctx.version.content)
    : ctx.version.content
  const rootId = await withRefresh(() => createTweet(tokens, rootText, rootMediaIds, null))

  if (ctx.version.isThread && ctx.version.threadParts.length > 1) {
    let parent = rootId
    for (let i = 1; i < ctx.version.threadParts.length; i++) {
      const part = ctx.version.threadParts[i]!
      const partMedia = part.mediaIds
        .map((id) => mediaById.get(id))
        .filter((m): m is PublishMedia => !!m)
      const ids = await withRefresh(() => uploadMedia(tokens, partMedia))
      parent = await withRefresh(() => createTweet(tokens, part.content, ids, parent))
    }
  }

  return {
    platformPostId: rootId,
    url: `https://twitter.com/${ctx.account.accountHandle}/status/${rootId}`,
    publishedAt: new Date(),
  }
}
