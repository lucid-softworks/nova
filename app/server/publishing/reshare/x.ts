import { PublishError } from '../errors'
import { persistRefreshedTokens } from '../helpers'
import type { PublishResult, ReshareContext } from '../index'

const API = 'https://api.twitter.com'

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
  return new PublishError({
    code: 'UNKNOWN',
    message: `X ${where} ${status}: ${body.slice(0, 400)}`,
    userMessage: 'X reshare failed.',
  })
}

async function getUserId(tokens: Tokens): Promise<string> {
  const res = await fetch(`${API}/2/users/me`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })
  if (!res.ok) throw httpError(res.status, 'users/me', await res.text())
  const json = (await res.json()) as { data: { id: string } }
  return json.data.id
}

async function retweet(tokens: Tokens, userId: string, tweetId: string): Promise<void> {
  const res = await fetch(`${API}/2/users/${encodeURIComponent(userId)}/retweets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tweet_id: tweetId }),
  })
  if (!res.ok) throw httpError(res.status, 'users/retweets', await res.text())
}

async function quoteTweet(
  tokens: Tokens,
  text: string,
  quotedId: string,
): Promise<string> {
  const res = await fetch(`${API}/2/tweets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, quote_tweet_id: quotedId }),
  })
  if (!res.ok) throw httpError(res.status, '2/tweets (quote)', await res.text())
  const json = (await res.json()) as { data: { id: string } }
  return json.data.id
}

export async function resharePost(ctx: ReshareContext): Promise<PublishResult> {
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

  const { reshareType, sourcePostId, sourcePostUrl, quoteComment } = ctx.reshare

  if (reshareType === 'quote') {
    const id = await withRefresh(() => quoteTweet(tokens, quoteComment ?? '', sourcePostId))
    return {
      platformPostId: id,
      url: `https://twitter.com/${ctx.account.accountHandle}/status/${id}`,
      publishedAt: new Date(),
    }
  }

  if (reshareType === 'repost' || reshareType === 'share') {
    let userId = (ctx.account.metadata.userId as string | undefined) ?? null
    if (!userId) userId = await withRefresh(() => getUserId(tokens))
    await withRefresh(() => retweet(tokens, userId!, sourcePostId))
    return {
      platformPostId: sourcePostId,
      url: sourcePostUrl,
      publishedAt: new Date(),
    }
  }

  throw new PublishError({
    code: 'NOT_IMPLEMENTED',
    message: `X reshare type ${reshareType} not supported`,
    userMessage: `X does not support ${reshareType} reshares.`,
    retryable: false,
  })
}
