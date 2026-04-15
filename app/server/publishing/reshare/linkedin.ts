import { persistRefreshedTokens } from '../helpers'
import { PublishError } from '../errors'
import type { PublishResult, ReshareContext } from '../index'

const REST_BASE = 'https://api.linkedin.com/rest'
const LI_VERSION = '202401'

type Tokens = { accessToken: string; refreshToken: string }

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
  if (status === 400 || status === 422) {
    return new PublishError({
      code: 'INVALID_FORMAT',
      message: `LinkedIn ${context} ${status}: ${body.slice(0, 400)}`,
      userMessage: 'LinkedIn rejected the reshare format.',
      retryable: false,
    })
  }
  return new PublishError({
    code: 'UNKNOWN',
    message: `LinkedIn ${context} ${status}: ${body.slice(0, 400)}`,
    userMessage: 'LinkedIn reshare failed.',
  })
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
  const json = (await res.json()) as { access_token: string; refresh_token?: string }
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? refreshToken }
}

async function createReshare(
  tokens: Tokens,
  authorUrn: string,
  sourceUrn: string,
  commentary: string,
): Promise<string> {
  const body = {
    author: authorUrn,
    commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    reshareContext: { parent: sourceUrn, root: sourceUrn },
  }
  const res = await fetch(`${REST_BASE}/posts`, {
    method: 'POST',
    headers: restHeaders(tokens.accessToken),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw mapRestError(res.status, txt, '/posts')
  }
  const text = await res.text()
  const json = (text.length > 0 ? JSON.parse(text) : {}) as { id?: string }
  const urn = res.headers.get('x-restli-id') ?? json.id
  if (!urn) {
    throw new PublishError({
      code: 'UNKNOWN',
      message: 'LinkedIn reshare returned no URN',
      userMessage: 'LinkedIn reshare failed.',
    })
  }
  return urn
}

function feedUrl(postUrn: string): string {
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`
}

export async function resharePost(ctx: ReshareContext): Promise<PublishResult> {
  const authorUrn = resolveAuthorUrn(ctx.account.metadata)
  if (!authorUrn) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'LinkedIn account missing member URN',
      userMessage: 'LinkedIn account not connected properly — reconnect.',
      retryable: false,
    })
  }

  const sourceUrn = ctx.reshare.sourcePostId
  if (!sourceUrn) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'LinkedIn reshare missing source URN',
      userMessage: 'Source post ID is required to reshare on LinkedIn.',
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

  const commentary = ctx.reshare.quoteComment ?? ''
  const postUrn = await withRefresh(() => createReshare(tokens, authorUrn, sourceUrn, commentary))

  return {
    platformPostId: postUrn,
    url: feedUrl(postUrn),
    publishedAt: new Date(),
  }
}
