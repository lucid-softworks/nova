import { PublishError } from '../errors'
import type { PublishContext, PublishResult } from '../index'

const BASE = 'https://graph.threads.net/v1.0'

type GraphError = {
  error?: { message?: string; code?: number; error_subcode?: number }
}

async function graphRequest<T>(
  path: string,
  params: URLSearchParams,
  method: 'GET' | 'POST' = 'POST',
): Promise<T> {
  const url = method === 'GET' ? `${BASE}${path}?${params.toString()}` : `${BASE}${path}`
  const init: RequestInit = { method }
  if (method === 'POST') init.body = params
  const res = await fetch(url, init)
  if (!res.ok) {
    const txt = await res.text()
    let parsed: GraphError = {}
    try {
      parsed = JSON.parse(txt) as GraphError
    } catch {
      // non-json
    }
    const msg = parsed.error?.message ?? txt
    if (res.status === 401 || res.status === 403) {
      throw new PublishError({
        code: 'AUTH_EXPIRED',
        message: `Threads ${path} ${res.status}: ${msg.slice(0, 300)}`,
        userMessage: 'Threads session expired — reconnect your account.',
        retryable: false,
      })
    }
    if (res.status === 429) {
      throw new PublishError({
        code: 'RATE_LIMITED',
        message: `Threads rate limited on ${path}`,
        userMessage: 'Threads is rate limiting us — will retry shortly.',
        retryable: true,
      })
    }
    if (res.status === 413) {
      throw new PublishError({
        code: 'MEDIA_TOO_LARGE',
        message: `Threads ${path} 413`,
        userMessage: 'Threads rejected the media as too large.',
        retryable: false,
      })
    }
    throw new PublishError({
      code: 'UNKNOWN',
      message: `Threads ${path} ${res.status}: ${msg.slice(0, 400)}`,
      userMessage: 'Threads publish failed.',
    })
  }
  return (await res.json()) as T
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const userId = ctx.account.metadata.userId as string | undefined
  if (!userId) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'Threads account missing userId',
      userMessage: 'Threads account not connected properly — reconnect.',
      retryable: false,
    })
  }
  const accessToken = ctx.account.accessToken
  const text = ctx.version.content

  for (const m of ctx.media) {
    if (m.url.startsWith('/media/')) {
      throw new PublishError({
        code: 'INVALID_FORMAT',
        message: `Threads media at local path ${m.url}`,
        userMessage: 'Threads requires media at a public URL.',
        retryable: false,
      })
    }
  }

  const images = ctx.media.filter((m) => m.mimeType.startsWith('image/'))
  const videos = ctx.media.filter((m) => m.mimeType.startsWith('video/'))

  if (videos.length > 0) {
    throw new PublishError({
      code: 'NOT_IMPLEMENTED',
      message: 'Threads video posting not implemented',
      userMessage: "Threads video posting isn't supported yet.",
      retryable: false,
    })
  }

  const createParams = new URLSearchParams()
  if (images.length === 0) {
    createParams.set('media_type', 'TEXT')
    createParams.set('text', text)
  } else {
    createParams.set('media_type', 'IMAGE')
    createParams.set('image_url', images[0]!.url)
    if (text) createParams.set('text', text)
  }
  createParams.set('access_token', accessToken)

  const container = await graphRequest<{ id: string }>(`/${userId}/threads`, createParams)

  const pub = new URLSearchParams()
  pub.set('creation_id', container.id)
  pub.set('access_token', accessToken)
  const published = await graphRequest<{ id: string }>(`/${userId}/threads_publish`, pub)
  const postId = published.id

  let url = `https://www.threads.net/@${ctx.account.accountHandle}/post/${postId}`
  try {
    const q = new URLSearchParams()
    q.set('fields', 'permalink')
    q.set('access_token', accessToken)
    const info = await graphRequest<{ permalink?: string }>(`/${postId}`, q, 'GET')
    if (info.permalink) url = info.permalink
  } catch {
    // fall back
  }

  return { platformPostId: postId, url, publishedAt: new Date() }
}
