import { loadMediaBuffer, persistRefreshedTokens } from '../helpers'
import { PublishError } from '../errors'
import type { PublishContext, PublishResult } from '../index'

type Tokens = { accessToken: string; refreshToken: string | null }

type SubmitResponse = {
  json: {
    errors: Array<[string, string, string] | string[]>
    data?: { url?: string; name?: string; id?: string }
  }
}

function userAgent(ctx: PublishContext): string {
  const ua = ctx.account.metadata.userAgent
  if (typeof ua === 'string' && ua.length > 0) return ua
  return `nova:v1 (by /u/${ctx.account.accountHandle})`
}

function stripSr(sr: string): string {
  return sr.replace(/^\/?r\//i, '').replace(/^\//, '')
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

async function redditFetch(
  url: string,
  tokens: Tokens,
  ua: string,
  body: URLSearchParams,
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'User-Agent': ua,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
}

function throwForStatus(res: Response, txt: string, label: string): never {
  if (res.status === 401) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: `Reddit ${label} 401`,
      userMessage: 'Reddit session expired — reconnect your account.',
      retryable: false,
    })
  }
  const remaining = res.headers.get('x-ratelimit-remaining')
  if (res.status === 429 || (remaining !== null && Number(remaining) <= 0)) {
    throw new PublishError({
      code: 'RATE_LIMITED',
      message: `Reddit rate limited on ${label}`,
      userMessage: 'Reddit is rate limiting us — will retry shortly.',
      retryable: true,
    })
  }
  throw new PublishError({
    code: 'UNKNOWN',
    message: `Reddit ${label} ${res.status}: ${txt.slice(0, 400)}`,
    userMessage: 'Reddit publish failed.',
  })
}

async function uploadMediaAsset(
  tokens: Tokens,
  ua: string,
  media: { buf: Buffer; mime: string; name: string },
): Promise<string> {
  const body = new URLSearchParams({ filepath: media.name, mimetype: media.mime })
  const res = await redditFetch('https://oauth.reddit.com/api/media/asset.json', tokens, ua, body)
  if (!res.ok) throwForStatus(res, await res.text(), 'media/asset')
  const json = (await res.json()) as {
    args: { action: string; fields: Array<{ name: string; value: string }> }
    asset: { asset_id: string; websocket_url?: string }
  }
  const action = json.args.action.startsWith('//') ? `https:${json.args.action}` : json.args.action
  const form = new FormData()
  for (const f of json.args.fields) form.append(f.name, f.value)
  form.append('file', new Blob([new Uint8Array(media.buf)], { type: media.mime }), media.name)
  const putRes = await fetch(action, { method: 'POST', body: form })
  if (!putRes.ok) {
    throw new PublishError({
      code: 'UNKNOWN',
      message: `Reddit media upload ${putRes.status}`,
      userMessage: 'Reddit rejected the media upload.',
    })
  }
  const loc = putRes.headers.get('location')
  if (loc) return loc
  const txt = await putRes.text()
  const match = txt.match(/<Location>([^<]+)<\/Location>/)
  if (match) return match[1]!
  throw new PublishError({
    code: 'UNKNOWN',
    message: 'Reddit media upload returned no location',
    userMessage: 'Reddit media upload failed.',
  })
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  if (!ctx.reddit) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'Reddit fields missing',
      userMessage: 'Reddit post is missing title/subreddit.',
      retryable: false,
    })
  }
  const reddit = ctx.reddit
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
  body.set('sr', stripSr(reddit.subreddit))
  body.set('title', reddit.title)
  body.set('api_type', 'json')
  body.set('nsfw', reddit.nsfw ? 'true' : 'false')
  body.set('spoiler', reddit.spoiler ? 'true' : 'false')

  switch (reddit.postType) {
    case 'text':
      body.set('kind', 'self')
      body.set('text', ctx.version.content)
      break
    case 'link':
      body.set('kind', 'link')
      body.set('url', ctx.version.platformVariables.reddit_link_url ?? ctx.version.content)
      break
    case 'image':
    case 'video': {
      const first = ctx.media[0]
      if (!first) {
        throw new PublishError({
          code: 'INVALID_FORMAT',
          message: 'Reddit image/video post missing media',
          userMessage: 'This Reddit post requires an image or video attachment.',
          retryable: false,
        })
      }
      const loaded = await loadMediaBuffer(first)
      const assetUrl = await withRefresh(() =>
        uploadMediaAsset(tokens, ua, { buf: loaded.buf, mime: loaded.mime, name: first.originalName }),
      )
      body.set('kind', reddit.postType)
      body.set('url', assetUrl)
      break
    }
    default:
      throw new PublishError({
        code: 'NOT_IMPLEMENTED',
        message: `Reddit postType ${reddit.postType as string} not supported`,
        userMessage: 'This Reddit post type is not supported yet.',
        retryable: false,
      })
  }

  const submit = await withRefresh(async () => {
    const res = await redditFetch('https://oauth.reddit.com/api/submit', tokens, ua, body)
    if (!res.ok) throwForStatus(res, await res.text(), 'submit')
    return (await res.json()) as SubmitResponse
  })

  if (submit.json.errors.length > 0) {
    const first = submit.json.errors[0]
    const msg = Array.isArray(first) ? first.join(': ') : String(first)
    throw new PublishError({
      code: 'UNKNOWN',
      message: `Reddit submit error: ${msg}`,
      userMessage: `Reddit rejected the post: ${msg}`,
    })
  }
  const data = submit.json.data
  if (!data?.name || !data.url) {
    throw new PublishError({
      code: 'UNKNOWN',
      message: 'Reddit submit missing data',
      userMessage: 'Reddit did not return a post id.',
    })
  }

  return { platformPostId: data.name, url: data.url, publishedAt: new Date() }
}
