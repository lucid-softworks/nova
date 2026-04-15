import { persistRefreshedTokens } from '../helpers'
import { PublishError } from '../errors'
import type { PublishResult, ReshareContext } from '../index'

type Tokens = { accessToken: string; refreshToken: string | null }

type SubmitResponse = {
  json: {
    errors: Array<string[] | string>
    data?: { url?: string; name?: string; id?: string }
  }
}

function userAgent(ctx: ReshareContext): string {
  const ua = ctx.account.metadata.userAgent
  if (typeof ua === 'string' && ua.length > 0) return ua
  return `nova:v1 (by /u/${ctx.account.accountHandle})`
}

function stripSr(sr: string): string {
  return sr.replace(/^\/?r\//i, '').replace(/^\//, '')
}

function normalizeFullname(id: string): string {
  return id.startsWith('t3_') ? id : `t3_${id}`
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date | null }> {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'Reddit client credentials missing',
      userMessage: 'Reddit integration is not configured — contact support.',
      retryable: false,
    })
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: `Reddit refresh failed (${res.status})`,
      userMessage: 'Reddit session expired — reconnect your account.',
      retryable: false,
    })
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
  }
}

export async function resharePost(ctx: ReshareContext): Promise<PublishResult> {
  const target = ctx.reshare.targetSubreddit
  if (!target) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'Reddit crosspost missing target subreddit',
      userMessage: 'Pick a subreddit to crosspost into.',
      retryable: false,
    })
  }
  const sourceId = normalizeFullname(ctx.reshare.sourcePostId)
  const ua = userAgent(ctx)
  let tokens: Tokens = { accessToken: ctx.account.accessToken, refreshToken: ctx.account.refreshToken }

  const withRefresh = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof PublishError && err.code === 'AUTH_EXPIRED' && tokens.refreshToken) {
        const refreshed = await refreshAccessToken(tokens.refreshToken)
        tokens = { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken }
        await persistRefreshedTokens(ctx.account.id, {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
        })
        return await fn()
      }
      throw err
    }
  }

  const body = new URLSearchParams()
  body.set('sr', stripSr(target))
  body.set('title', ctx.reshare.quoteComment ?? 'Crosspost')
  body.set('kind', 'crosspost')
  body.set('crosspost_fullname', sourceId)
  body.set('api_type', 'json')

  const submit = await withRefresh(async () => {
    const res = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'User-Agent': ua,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    if (!res.ok) {
      const txt = await res.text()
      if (res.status === 401) {
        throw new PublishError({
          code: 'AUTH_EXPIRED',
          message: 'Reddit crosspost 401',
          userMessage: 'Reddit session expired — reconnect your account.',
          retryable: false,
        })
      }
      const remaining = res.headers.get('x-ratelimit-remaining')
      if (res.status === 429 || (remaining !== null && Number(remaining) <= 0)) {
        throw new PublishError({
          code: 'RATE_LIMITED',
          message: 'Reddit rate limited on crosspost',
          userMessage: 'Reddit is rate limiting us — will retry shortly.',
          retryable: true,
        })
      }
      throw new PublishError({
        code: 'UNKNOWN',
        message: `Reddit crosspost ${res.status}: ${txt.slice(0, 400)}`,
        userMessage: 'Reddit crosspost failed.',
      })
    }
    return (await res.json()) as SubmitResponse
  })

  if (submit.json.errors.length > 0) {
    const first = submit.json.errors[0]
    const msg = Array.isArray(first) ? first.join(': ') : String(first)
    throw new PublishError({
      code: 'UNKNOWN',
      message: `Reddit crosspost error: ${msg}`,
      userMessage: `Reddit rejected the crosspost: ${msg}`,
    })
  }
  const data = submit.json.data
  if (!data?.name || !data.url) {
    throw new PublishError({
      code: 'UNKNOWN',
      message: 'Reddit crosspost missing data',
      userMessage: 'Reddit did not return a post id.',
    })
  }

  return { platformPostId: data.name, url: data.url, publishedAt: new Date() }
}
