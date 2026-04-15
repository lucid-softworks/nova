import { loadMediaBuffer } from '../helpers'
import { PublishError } from '../errors'
import type { PublishContext, PublishResult } from '../index'

const BASE = 'https://api.tumblr.com/v2'

type TumblrPostResponse = {
  response: {
    id?: number
    id_string?: string
    display_text?: string
  }
}

function resolveBlog(ctx: PublishContext): string {
  const metaBlog = ctx.account.metadata.blog as string | undefined
  const blog = metaBlog ?? ctx.account.accountHandle
  if (!blog) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'Tumblr account missing blog identifier',
      userMessage: 'Tumblr account missing blog — reconnect.',
      retryable: false,
    })
  }
  return blog
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
  if (status === 413) {
    return new PublishError({
      code: 'MEDIA_TOO_LARGE',
      message: `Tumblr ${endpoint} 413`,
      userMessage: 'Tumblr rejected the media as too large.',
      retryable: false,
    })
  }
  return new PublishError({
    code: 'UNKNOWN',
    message: `Tumblr ${endpoint} ${status}: ${body.slice(0, 400)}`,
    userMessage: 'Tumblr publish failed.',
  })
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const blog = resolveBlog(ctx)
  const token = ctx.account.accessToken
  const endpoint = `/blog/${blog}/posts`

  const images = ctx.media.filter((m) => m.mimeType.startsWith('image/'))
  const contentBlocks: Array<Record<string, unknown>> = [
    { type: 'text', text: ctx.version.content },
  ]
  for (let i = 0; i < images.length; i++) {
    contentBlocks.push({ type: 'image', media: [{ identifier: `media_${i}` }] })
  }

  let res: Response
  if (images.length === 0) {
    res = await fetch(`${BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ content: contentBlocks, tags: [] }),
    })
  } else {
    const form = new FormData()
    form.set('json', JSON.stringify({ content: contentBlocks, tags: [] }))
    for (let i = 0; i < images.length; i++) {
      const { buf, mime } = await loadMediaBuffer(images[i]!)
      form.set(
        `media_${i}`,
        new Blob([new Uint8Array(buf)], { type: mime }),
        images[i]!.originalName || `media_${i}`,
      )
    }
    res = await fetch(`${BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: form,
    })
  }

  if (!res.ok) {
    throw mapError(endpoint, res.status, await res.text())
  }
  const json = (await res.json()) as TumblrPostResponse
  const id = json.response.id_string ?? String(json.response.id ?? '')
  if (!id) {
    throw new PublishError({
      code: 'UNKNOWN',
      message: `Tumblr ${endpoint} missing id in response`,
      userMessage: 'Tumblr publish failed.',
    })
  }
  return {
    platformPostId: id,
    url: `https://${blog}/post/${id}`,
    publishedAt: new Date(),
  }
}
