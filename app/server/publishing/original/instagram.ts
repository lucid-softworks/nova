import { PublishError } from '../errors'
import type { PublishContext, PublishResult } from '../index'

const GRAPH = 'https://graph.facebook.com/v19.0'

type GraphError = {
  error?: {
    message?: string
    code?: number
    error_subcode?: number
  }
}

async function graphRequest<T>(path: string, body: URLSearchParams, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  const url = method === 'GET' ? `${GRAPH}${path}?${body.toString()}` : `${GRAPH}${path}`
  const init: RequestInit = { method }
  if (method === 'POST') init.body = body
  const res = await fetch(url, init)
  if (!res.ok) {
    const txt = await res.text()
    let parsed: GraphError = {}
    try {
      parsed = JSON.parse(txt) as GraphError
    } catch {
      // non-json response
    }
    const code = parsed.error?.code
    const sub = parsed.error?.error_subcode
    const msg = parsed.error?.message ?? txt

    if (code === 190 || sub === 190 || res.status === 401 || res.status === 403) {
      throw new PublishError({
        code: 'AUTH_EXPIRED',
        message: `Instagram ${path} ${res.status}: ${msg.slice(0, 300)}`,
        userMessage: 'Instagram session expired — reconnect your account.',
        retryable: false,
      })
    }
    if (
      res.status === 429 ||
      sub === 4 ||
      sub === 17 ||
      sub === 32 ||
      sub === 613 ||
      code === 4 ||
      code === 17 ||
      code === 32 ||
      code === 613
    ) {
      throw new PublishError({
        code: 'RATE_LIMITED',
        message: `Instagram rate limited on ${path}`,
        userMessage: 'Instagram is rate limiting us — will retry shortly.',
        retryable: true,
      })
    }
    throw new PublishError({
      code: 'UNKNOWN',
      message: `Instagram ${path} ${res.status}: ${msg.slice(0, 400)}`,
      userMessage: 'Instagram publish failed.',
    })
  }
  return (await res.json()) as T
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const igUserId = ctx.account.metadata.igUserId as string | undefined
  if (!igUserId) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'Instagram account missing igUserId',
      userMessage: 'Instagram account not connected properly — reconnect.',
      retryable: false,
    })
  }
  const accessToken = ctx.account.accessToken
  const caption = ctx.version.platformVariables.ig_caption ?? ctx.version.content

  if (ctx.media.length === 0) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'Instagram requires media',
      userMessage: 'Instagram requires at least one image.',
      retryable: false,
    })
  }
  const videos = ctx.media.filter((m) => m.mimeType.startsWith('video/'))
  if (videos.length > 0) {
    throw new PublishError({
      code: 'NOT_IMPLEMENTED',
      message: 'Instagram video/reels not implemented',
      userMessage: "Instagram video posting isn't supported yet.",
      retryable: false,
    })
  }
  const images = ctx.media.filter((m) => m.mimeType.startsWith('image/'))
  if (images.length === 0) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'Instagram requires at least one image',
      userMessage: 'Instagram requires at least one image.',
      retryable: false,
    })
  }

  let containerId: string

  if (images.length === 1) {
    const params = new URLSearchParams()
    params.set('image_url', images[0]!.url)
    params.set('caption', caption)
    params.set('access_token', accessToken)
    const r = await graphRequest<{ id: string }>(`/${igUserId}/media`, params)
    containerId = r.id
  } else {
    if (images.length > 10) {
      throw new PublishError({
        code: 'INVALID_FORMAT',
        message: 'Instagram carousel accepts at most 10 items',
        userMessage: 'Instagram allows at most 10 images per carousel.',
        retryable: false,
      })
    }
    const childIds: string[] = []
    for (const m of images) {
      const p = new URLSearchParams()
      p.set('image_url', m.url)
      p.set('is_carousel_item', 'true')
      p.set('access_token', accessToken)
      const r = await graphRequest<{ id: string }>(`/${igUserId}/media`, p)
      childIds.push(r.id)
    }
    const p = new URLSearchParams()
    p.set('media_type', 'CAROUSEL')
    p.set('children', childIds.join(','))
    p.set('caption', caption)
    p.set('access_token', accessToken)
    const r = await graphRequest<{ id: string }>(`/${igUserId}/media`, p)
    containerId = r.id
  }

  const pub = new URLSearchParams()
  pub.set('creation_id', containerId)
  pub.set('access_token', accessToken)
  const published = await graphRequest<{ id: string }>(`/${igUserId}/media_publish`, pub)
  const postId = published.id

  let url = 'https://www.instagram.com/p/PLACEHOLDER/'
  try {
    const q = new URLSearchParams()
    q.set('fields', 'permalink')
    q.set('access_token', accessToken)
    const info = await graphRequest<{ permalink?: string }>(`/${postId}`, q, 'GET')
    if (info.permalink) url = info.permalink
  } catch {
    // fall back to placeholder
  }

  return { platformPostId: postId, url, publishedAt: new Date() }
}
