import { loadMediaBuffer, persistRefreshedTokens } from '../helpers'
import { PublishError } from '../errors'
import type { PublishContext, PublishMedia, PublishResult } from '../index'

const REST_BASE = 'https://api.linkedin.com/rest'
const LI_VERSION = '202401'
const MAX_IMAGES = 9

type Tokens = { accessToken: string; refreshToken: string }

type InitUploadResponse = {
  value: { uploadUrl: string; image: string; uploadUrlExpiresAt?: number }
}

function restHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': LI_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }
}

function resolveAuthorUrn(metadata: Record<string, unknown>): string | null {
  const urn = metadata.urn
  if (typeof urn === 'string' && urn.startsWith('urn:li:')) return urn
  const sub = metadata.sub ?? metadata.id
  if (typeof sub === 'string' && sub.length > 0) {
    if (sub.startsWith('urn:li:')) return sub
    return `urn:li:person:${sub}`
  }
  return null
}

function mapRestError(status: number, body: string, context: string): PublishError {
  if (status === 401) {
    return new PublishError({
      code: 'AUTH_EXPIRED',
      message: `LinkedIn ${context} 401`,
      userMessage: 'LinkedIn session expired — reconnect your account.',
      retryable: false,
    })
  }
  if (status === 429) {
    return new PublishError({
      code: 'RATE_LIMITED',
      message: `LinkedIn ${context} rate limited`,
      userMessage: 'LinkedIn is rate limiting us — will retry shortly.',
      retryable: true,
    })
  }
  if (status === 413) {
    return new PublishError({
      code: 'MEDIA_TOO_LARGE',
      message: `LinkedIn ${context} 413: ${body.slice(0, 300)}`,
      userMessage: 'LinkedIn rejected the media as too large.',
      retryable: false,
    })
  }
  if (status === 400 || status === 422) {
    return new PublishError({
      code: 'INVALID_FORMAT',
      message: `LinkedIn ${context} ${status}: ${body.slice(0, 400)}`,
      userMessage: 'LinkedIn rejected the post format.',
      retryable: false,
    })
  }
  return new PublishError({
    code: 'UNKNOWN',
    message: `LinkedIn ${context} ${status}: ${body.slice(0, 400)}`,
    userMessage: 'LinkedIn publish failed.',
  })
}

async function liRest<T>(
  method: 'GET' | 'POST',
  path: string,
  tokens: Tokens,
  body?: unknown,
): Promise<{ json: T; headers: Headers }> {
  const res = await fetch(`${REST_BASE}${path}`, {
    method,
    headers: restHeaders(tokens.accessToken),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw mapRestError(res.status, txt, path)
  }
  const text = await res.text()
  const json = (text.length > 0 ? JSON.parse(text) : {}) as T
  return { json, headers: res.headers }
}

async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  if (!clientId || !clientSecret || !refreshToken) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'LinkedIn refresh prerequisites missing',
      userMessage: 'LinkedIn session expired — reconnect your account.',
      retryable: false,
    })
  }
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (!res.ok) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: `LinkedIn refresh failed (${res.status})`,
      userMessage: 'LinkedIn session expired — reconnect your account.',
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

async function uploadImage(
  tokens: Tokens,
  authorUrn: string,
  media: PublishMedia,
): Promise<string> {
  const { json: init } = await liRest<InitUploadResponse>(
    'POST',
    '/images?action=initializeUpload',
    tokens,
    { initializeUploadRequest: { owner: authorUrn } },
  )
  const { uploadUrl, image } = init.value
  const { buf, mime } = await loadMediaBuffer(media)
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': mime,
    },
    body: new Uint8Array(buf),
  })
  if (!putRes.ok) {
    const txt = await putRes.text()
    throw mapRestError(putRes.status, txt, 'image upload')
  }
  return image
}

type PostBody = {
  author: string
  commentary: string
  visibility: 'PUBLIC'
  distribution: {
    feedDistribution: 'MAIN_FEED'
    targetEntities: unknown[]
    thirdPartyDistributionChannels: unknown[]
  }
  lifecycleState: 'PUBLISHED'
  isReshareDisabledByAuthor: boolean
  content?: Record<string, unknown>
  reshareContext?: { parent: string; root: string }
}

function baseBody(author: string, commentary: string): PostBody {
  return {
    author,
    commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }
}

async function createPost(tokens: Tokens, body: PostBody): Promise<string> {
  const { json, headers } = await liRest<{ id?: string }>('POST', '/posts', tokens, body)
  const urn = headers.get('x-restli-id') ?? json.id
  if (!urn) {
    throw new PublishError({
      code: 'UNKNOWN',
      message: 'LinkedIn create post returned no URN',
      userMessage: 'LinkedIn publish failed.',
    })
  }
  return urn
}

function feedUrl(postUrn: string): string {
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const authorUrn = resolveAuthorUrn(ctx.account.metadata)
  if (!authorUrn) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'LinkedIn account missing member URN',
      userMessage: 'LinkedIn account not connected properly — reconnect.',
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

  const firstMedia = ctx.media[0]
  if (firstMedia && firstMedia.mimeType.startsWith('video/')) {
    throw new PublishError({
      code: 'NOT_IMPLEMENTED',
      message: 'LinkedIn video requires multipart upload not yet wired',
      userMessage: 'LinkedIn video posting not yet supported.',
      retryable: false,
    })
  }

  const imageMedia = ctx.media.filter((m) => m.mimeType.startsWith('image/')).slice(0, MAX_IMAGES)
  const imageUrns: string[] = []
  for (const m of imageMedia) {
    const urn = await withRefresh(() => uploadImage(tokens, authorUrn, m))
    imageUrns.push(urn)
  }

  const body = baseBody(authorUrn, ctx.version.content)
  if (imageUrns.length === 1) {
    body.content = { media: { id: imageUrns[0], altText: imageMedia[0]?.originalName ?? '' } }
  } else if (imageUrns.length > 1) {
    body.content = {
      multiImage: {
        images: imageUrns.map((id, i) => ({ id, altText: imageMedia[i]?.originalName ?? '' })),
      },
    }
  }

  const postUrn = await withRefresh(() => createPost(tokens, body))

  return {
    platformPostId: postUrn,
    url: feedUrl(postUrn),
    publishedAt: new Date(),
  }
}
