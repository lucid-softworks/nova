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

async function waitForContainer(containerId: string, accessToken: string): Promise<void> {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const q = new URLSearchParams()
    q.set('fields', 'status,error_message')
    q.set('access_token', accessToken)
    const info = await graphRequest<{ status?: string; error_message?: string }>(
      `/${containerId}`,
      q,
      'GET',
    )
    if (info.status === 'FINISHED') return
    if (info.status === 'ERROR' || info.status === 'EXPIRED') {
      throw new PublishError({
        code: 'INVALID_FORMAT',
        message: `Threads container ${info.status}: ${info.error_message ?? 'unknown'}`,
        userMessage: info.error_message ?? 'Threads rejected the video.',
        retryable: false,
      })
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new PublishError({
    code: 'UNKNOWN',
    message: `Threads container ${containerId} timed out`,
    userMessage: 'Threads took too long to process the video.',
  })
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

  const images = ctx.media.filter((m) => m.mimeType.startsWith('image/'))
  const videos = ctx.media.filter((m) => m.mimeType.startsWith('video/'))

  const createParams = new URLSearchParams()
  if (videos.length > 0) {
    createParams.set('media_type', 'VIDEO')
    createParams.set('video_url', videos[0]!.url)
    if (text) createParams.set('text', text)
  } else if (images.length === 0) {
    createParams.set('media_type', 'TEXT')
    createParams.set('text', text)
  } else {
    createParams.set('media_type', 'IMAGE')
    createParams.set('image_url', images[0]!.url)
    if (text) createParams.set('text', text)
  }
  createParams.set('access_token', accessToken)
  const replyTarget = ctx.version.platformVariables.replyToPostId
  if (replyTarget) createParams.set('reply_to_id', replyTarget)

  const container = await graphRequest<{ id: string }>(`/${userId}/threads`, createParams)

  if (videos.length > 0) {
    await waitForContainer(container.id, accessToken)
  }

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
