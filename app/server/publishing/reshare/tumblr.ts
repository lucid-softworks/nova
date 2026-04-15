import { PublishError } from '../errors'
import type { PublishResult, ReshareContext } from '../index'

const BASE = 'https://api.tumblr.com/v2'

type PostFetchResponse = {
  response?: {
    posts?: Array<{
      id?: number
      id_string?: string
      reblog_key?: string
      tumblelog_uuid?: string
      blog?: { uuid?: string; name?: string }
    }>
  }
}

type ReblogResponse = {
  response: {
    id?: number
    id_string?: string
  }
}

function parseSource(raw: string): { blog: string; id: string } | null {
  if (!raw) return null
  if (raw.includes(':')) {
    const [blog, id] = raw.split(':', 2)
    if (blog && id) return { blog, id }
  }
  const m = raw.match(/https?:\/\/([^/]+)\/post\/(\d+)/)
  if (m) return { blog: m[1]!, id: m[2]! }
  return null
}

function mapError(endpoint: string, status: number, body: string): PublishError {
  if (status === 401) {
    return new PublishError({
      code: 'AUTH_EXPIRED',
      message: `Tumblr ${endpoint} 401`,
      userMessage: 'Tumblr session expired — reconnect your account.',
      retryable: false,
    })
  }
  if (status === 429) {
    return new PublishError({
      code: 'RATE_LIMITED',
      message: `Tumblr rate limited on ${endpoint}`,
      userMessage: 'Tumblr is rate limiting us — will retry shortly.',
      retryable: true,
    })
  }
  return new PublishError({
    code: 'UNKNOWN',
    message: `Tumblr ${endpoint} ${status}: ${body.slice(0, 400)}`,
    userMessage: 'Tumblr reshare failed.',
  })
}

export async function resharePost(ctx: ReshareContext): Promise<PublishResult> {
  const blog =
    (ctx.account.metadata.blog as string | undefined) ?? ctx.account.accountHandle
  if (!blog) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'Tumblr account missing blog identifier',
      userMessage: 'Tumblr account missing blog — reconnect.',
      retryable: false,
    })
  }
  const token = ctx.account.accessToken

  const source =
    parseSource(ctx.reshare.sourcePostId) ?? parseSource(ctx.reshare.sourcePostUrl)
  if (!source) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: `Tumblr reshare could not parse source ${ctx.reshare.sourcePostId}`,
      userMessage: 'Could not determine the Tumblr post to reblog.',
      retryable: false,
    })
  }

  const lookupEndpoint = `/blog/${source.blog}/posts`
  const lookupUrl = `${BASE}${lookupEndpoint}?id=${encodeURIComponent(source.id)}`
  const lookup = await fetch(lookupUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!lookup.ok) {
    throw mapError(lookupEndpoint, lookup.status, await lookup.text())
  }
  const lookupJson = (await lookup.json()) as PostFetchResponse
  const post = lookupJson.response?.posts?.[0]
  const reblogKey = post?.reblog_key
  const parentUuid = post?.tumblelog_uuid ?? post?.blog?.uuid
  if (!reblogKey || !parentUuid) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: `Tumblr reshare missing reblog_key or parent uuid for ${source.blog}:${source.id}`,
      userMessage: 'Could not reblog this Tumblr post — source data unavailable.',
      retryable: false,
    })
  }

  const endpoint = `/blog/${blog}/posts`
  const body = {
    parent_tumblelog_uuid: parentUuid,
    parent_post_id: source.id,
    reblog_key: reblogKey,
    content: [{ type: 'text', text: ctx.reshare.quoteComment ?? '' }],
  }
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw mapError(endpoint, res.status, await res.text())
  }
  const json = (await res.json()) as ReblogResponse
  const id = json.response.id_string ?? String(json.response.id ?? '')
  if (!id) {
    throw new PublishError({
      code: 'UNKNOWN',
      message: `Tumblr reshare missing id in response`,
      userMessage: 'Tumblr reshare failed.',
    })
  }
  return {
    platformPostId: id,
    url: `https://${blog}/post/${id}`,
    publishedAt: new Date(),
  }
}
