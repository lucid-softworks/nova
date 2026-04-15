import { loadMediaBuffer, persistRefreshedTokens } from '../helpers'
import { PublishError } from '../errors'
import type { PublishContext, PublishResult } from '../index'

const TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/'
const INIT_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
const STATUS_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'
const POLL_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 2_000

type Tokens = { accessToken: string; refreshToken: string }

function mapError(status: number, body: string, context: string): PublishError {
  if (status === 401) {
    return new PublishError({
      code: 'AUTH_EXPIRED',
      message: `TikTok ${context} 401`,
      userMessage: 'TikTok session expired — reconnect your account.',
      retryable: false,
    })
  }
  if (status === 429) {
    return new PublishError({
      code: 'RATE_LIMITED',
      message: `TikTok ${context} rate limited`,
      userMessage: 'TikTok is rate limiting us — will retry shortly.',
      retryable: true,
    })
  }
  if (status === 413) {
    return new PublishError({
      code: 'MEDIA_TOO_LARGE',
      message: `TikTok ${context} 413: ${body.slice(0, 300)}`,
      userMessage: 'TikTok rejected the video as too large.',
      retryable: false,
    })
  }
  if (status === 400 || status === 422) {
    return new PublishError({
      code: 'INVALID_FORMAT',
      message: `TikTok ${context} ${status}: ${body.slice(0, 400)}`,
      userMessage: 'TikTok rejected the video format.',
      retryable: false,
    })
  }
  return new PublishError({
    code: 'UNKNOWN',
    message: `TikTok ${context} ${status}: ${body.slice(0, 400)}`,
    userMessage: 'TikTok publish failed.',
  })
}

async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  if (!clientKey || !clientSecret || !refreshToken) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'TikTok refresh prerequisites missing',
      userMessage: 'TikTok session expired — reconnect your account.',
      retryable: false,
    })
  }
  const form = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (!res.ok) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: `TikTok refresh failed (${res.status})`,
      userMessage: 'TikTok session expired — reconnect your account.',
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
  }
}

async function ttPost<T>(
  url: string,
  tokens: Tokens,
  body: unknown,
  context: string,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw mapError(res.status, txt, context)
  }
  return (await res.json()) as T
}

type InitResponse = {
  data: { publish_id: string; upload_url: string }
  error?: { code: string; message: string }
}

type StatusResponse = {
  data: {
    status: string
    publicaly_available_post_id?: string[]
    publish_id?: string
    fail_reason?: string
  }
  error?: { code: string; message: string }
}

function buildInitBody(
  content: string,
  size: number,
  platformVariables: Record<string, string>,
): Record<string, unknown> {
  return {
    post_info: {
      title: content.slice(0, 2200),
      privacy_level: platformVariables.tiktok_privacy ?? 'SELF_ONLY',
      disable_duet: platformVariables.tiktok_disable_duet === 'true',
      disable_comment: platformVariables.tiktok_disable_comment === 'true',
      disable_stitch: platformVariables.tiktok_disable_stitch === 'true',
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: size,
      chunk_size: size,
      total_chunk_count: 1,
    },
  }
}

async function uploadBytes(uploadUrl: string, buf: Buffer, mime: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mime,
      'Content-Range': `bytes 0-${buf.length - 1}/${buf.length}`,
    },
    body: new Uint8Array(buf),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw mapError(res.status, txt, 'upload bytes')
  }
}

async function pollStatus(
  tokens: Tokens,
  publishId: string,
): Promise<StatusResponse['data'] | null> {
  const start = Date.now()
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const json = await ttPost<StatusResponse>(
      STATUS_ENDPOINT,
      tokens,
      { publish_id: publishId },
      'status fetch',
    )
    const status = json.data.status
    if (status === 'PUBLISH_COMPLETE') return json.data
    if (status === 'FAILED') {
      throw new PublishError({
        code: 'UNKNOWN',
        message: `TikTok publish failed: ${json.data.fail_reason ?? 'unknown'}`,
        userMessage: 'TikTok rejected the video during processing.',
      })
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  return null
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const firstMedia = ctx.media[0]
  if (!firstMedia || !firstMedia.mimeType.startsWith('video/')) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'TikTok post requires video media',
      userMessage: 'TikTok post requires a video.',
      retryable: false,
    })
  }

  const { buf, mime } = await loadMediaBuffer(firstMedia)

  let tokens: Tokens = {
    accessToken: ctx.account.accessToken,
    refreshToken: ctx.account.refreshToken ?? '',
  }

  const withRefresh = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof PublishError && err.code === 'AUTH_EXPIRED' && tokens.refreshToken) {
        tokens = await refreshTokens(tokens.refreshToken)
        await persistRefreshedTokens(ctx.account.id, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        })
        return await fn()
      }
      throw err
    }
  }

  const initBody = buildInitBody(ctx.version.content, buf.length, ctx.version.platformVariables)
  const init = await withRefresh(() =>
    ttPost<InitResponse>(INIT_ENDPOINT, tokens, initBody, 'init upload'),
  )
  const { publish_id, upload_url } = init.data

  await uploadBytes(upload_url, buf, mime)

  const status = await withRefresh(() => pollStatus(tokens, publish_id))
  const handle = ctx.account.accountHandle

  if (!status) {
    return {
      platformPostId: publish_id,
      url: `https://www.tiktok.com/@${handle}`,
      publishedAt: new Date(),
    }
  }

  const postId = status.publicaly_available_post_id?.[0]
  return {
    platformPostId: postId ?? publish_id,
    url: postId
      ? `https://www.tiktok.com/@${handle}/video/${postId}`
      : `https://www.tiktok.com/@${handle}`,
    publishedAt: new Date(),
  }
}
