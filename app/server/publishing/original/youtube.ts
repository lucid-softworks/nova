import { loadMediaRange, persistRefreshedTokens } from '../helpers'
import { PublishError } from '../errors'
import type { PublishContext, PublishResult } from '../index'

const UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
// YouTube requires chunks to be multiples of 256 KiB. 8 MiB is a good
// balance between roundtrips and keeping per-chunk memory bounded.
const CHUNK_SIZE = 8 * 1024 * 1024

type Tokens = { accessToken: string; refreshToken: string }

function mapError(status: number, body: string, context: string): PublishError {
  if (status === 401) {
    return new PublishError({
      code: 'AUTH_EXPIRED',
      message: `YouTube ${context} 401`,
      userMessage: 'YouTube session expired — reconnect your account.',
      retryable: false,
    })
  }
  if (status === 429) {
    return new PublishError({
      code: 'RATE_LIMITED',
      message: `YouTube ${context} rate limited`,
      userMessage: 'YouTube is rate limiting us — will retry shortly.',
      retryable: true,
    })
  }
  if (status === 413) {
    return new PublishError({
      code: 'MEDIA_TOO_LARGE',
      message: `YouTube ${context} 413: ${body.slice(0, 300)}`,
      userMessage: 'YouTube rejected the video as too large.',
      retryable: false,
    })
  }
  if (status === 400 || status === 422) {
    return new PublishError({
      code: 'INVALID_FORMAT',
      message: `YouTube ${context} ${status}: ${body.slice(0, 400)}`,
      userMessage: 'YouTube rejected the video format.',
      retryable: false,
    })
  }
  return new PublishError({
    code: 'UNKNOWN',
    message: `YouTube ${context} ${status}: ${body.slice(0, 400)}`,
    userMessage: 'YouTube publish failed.',
  })
}

async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
  if (!clientId || !clientSecret || !refreshToken) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'YouTube refresh prerequisites missing',
      userMessage: 'YouTube session expired — reconnect your account.',
      retryable: false,
    })
  }
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (!res.ok) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: `YouTube refresh failed (${res.status})`,
      userMessage: 'YouTube session expired — reconnect your account.',
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

type InitiateResponse = { location: string }

async function initiateUpload(
  tokens: Tokens,
  metadata: Record<string, unknown>,
  mime: string,
  size: number,
): Promise<InitiateResponse> {
  const res = await fetch(UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(size),
    },
    body: JSON.stringify(metadata),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw mapError(res.status, txt, 'initiate upload')
  }
  const location = res.headers.get('location')
  if (!location) {
    throw new PublishError({
      code: 'UNKNOWN',
      message: 'YouTube initiate returned no Location header',
      userMessage: 'YouTube publish failed.',
    })
  }
  return { location }
}

type VideoResource = {
  id: string
  snippet?: { title?: string }
  status?: { privacyStatus?: string }
}

async function uploadChunks(
  location: string,
  media: import('../index').PublishMedia,
  totalSize: number,
  mime: string,
): Promise<VideoResource> {
  let offset = 0
  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize) - 1
    const chunk = await loadMediaRange(media, offset, end)
    const res = await fetch(location, {
      method: 'PUT',
      headers: {
        'Content-Type': mime,
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${offset}-${end}/${totalSize}`,
      },
      body: new Uint8Array(chunk),
    })
    if (res.status === 308) {
      // Resume Incomplete — server tells us the next byte it wants via the
      // Range header (inclusive end). If missing, assume it accepted all.
      const range = res.headers.get('range')
      if (range) {
        const m = /bytes=\d+-(\d+)/.exec(range)
        offset = m ? Number(m[1]) + 1 : end + 1
      } else {
        offset = end + 1
      }
      continue
    }
    if (res.ok) return (await res.json()) as VideoResource
    const txt = await res.text()
    throw mapError(res.status, txt, 'upload chunk')
  }
  throw new PublishError({
    code: 'UNKNOWN',
    message: 'YouTube upload finished without terminal 200 response',
    userMessage: 'YouTube publish failed.',
  })
}

function buildMetadata(
  content: string,
  platformVariables: Record<string, string>,
): Record<string, unknown> {
  const title = platformVariables.youtube_title ?? content.slice(0, 100)
  const tags = (platformVariables.youtube_tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return {
    snippet: {
      title,
      description: content,
      tags,
      categoryId: platformVariables.youtube_category_id ?? '22',
    },
    status: {
      privacyStatus: platformVariables.youtube_privacy ?? 'private',
      selfDeclaredMadeForKids: platformVariables.youtube_made_for_kids === 'true',
    },
  }
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const firstMedia = ctx.media[0]
  if (!firstMedia) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'YouTube post has no media',
      userMessage: 'YouTube requires a video.',
      retryable: false,
    })
  }
  if (!firstMedia.mimeType.startsWith('video/')) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: `YouTube media is ${firstMedia.mimeType}, expected video/*`,
      userMessage: 'YouTube requires a video.',
      retryable: false,
    })
  }

  const mime = firstMedia.mimeType
  const totalSize = firstMedia.size
  if (totalSize <= 0) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'YouTube media has zero size',
      userMessage: 'Video file appears to be empty.',
      retryable: false,
    })
  }

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

  const metadata = buildMetadata(ctx.version.content, ctx.version.platformVariables)
  const { location } = await withRefresh(() => initiateUpload(tokens, metadata, mime, totalSize))
  const video = await withRefresh(() => uploadChunks(location, firstMedia, totalSize, mime))

  return {
    platformPostId: video.id,
    url: `https://youtube.com/watch?v=${video.id}`,
    publishedAt: new Date(),
  }
}
