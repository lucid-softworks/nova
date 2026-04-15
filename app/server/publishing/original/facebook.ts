import { loadMediaBuffer } from '../helpers'
import { PublishError } from '../errors'
import type { PublishContext, PublishMedia, PublishResult } from '../index'

const GRAPH = 'https://graph.facebook.com/v19.0'

type GraphError = {
  error?: {
    message?: string
    code?: number
    error_subcode?: number
  }
}

async function graphRequest<T>(
  path: string,
  body: FormData | URLSearchParams,
): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, { method: 'POST', body })
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
        message: `Facebook ${path} ${res.status}: ${msg.slice(0, 300)}`,
        userMessage: 'Facebook session expired — reconnect your page.',
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
        message: `Facebook rate limited on ${path}`,
        userMessage: 'Facebook is rate limiting us — will retry shortly.',
        retryable: true,
      })
    }
    throw new PublishError({
      code: 'UNKNOWN',
      message: `Facebook ${path} ${res.status}: ${msg.slice(0, 400)}`,
      userMessage: 'Facebook publish failed.',
    })
  }
  return (await res.json()) as T
}

async function uploadPhoto(
  pageId: string,
  accessToken: string,
  media: PublishMedia,
  caption: string | null,
  published: boolean,
): Promise<{ id: string; post_id?: string }> {
  const { buf, mime } = await loadMediaBuffer(media)
  const form = new FormData()
  form.append('source', new Blob([new Uint8Array(buf)], { type: mime }), media.originalName)
  form.append('published', published ? 'true' : 'false')
  form.append('access_token', accessToken)
  if (caption) form.append('caption', caption)
  return graphRequest<{ id: string; post_id?: string }>(`/${pageId}/photos`, form)
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const pageId = ctx.account.metadata.pageId as string | undefined
  if (!pageId) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'Facebook account missing pageId',
      userMessage: 'Facebook page not connected properly — reconnect.',
      retryable: false,
    })
  }
  const accessToken = ctx.account.accessToken
  const content = ctx.version.content
  const images = ctx.media.filter((m) => m.mimeType.startsWith('image/'))
  const videos = ctx.media.filter((m) => m.mimeType.startsWith('video/'))

  if (videos.length > 0) {
    throw new PublishError({
      code: 'NOT_IMPLEMENTED',
      message: 'Facebook video posting not implemented',
      userMessage: "Facebook video posting isn't supported yet.",
      retryable: false,
    })
  }

  let platformPostId: string

  if (images.length === 1) {
    const photo = await uploadPhoto(pageId, accessToken, images[0]!, content, true)
    platformPostId = photo.post_id ?? photo.id
  } else if (images.length > 1) {
    const ids: string[] = []
    for (const m of images) {
      const up = await uploadPhoto(pageId, accessToken, m, null, false)
      ids.push(up.id)
    }
    const form = new FormData()
    form.append('message', content)
    form.append('access_token', accessToken)
    ids.forEach((id, i) => {
      form.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: id }))
    })
    const feed = await graphRequest<{ id: string; post_id?: string }>(`/${pageId}/feed`, form)
    platformPostId = feed.post_id ?? feed.id
  } else {
    const params = new URLSearchParams()
    params.set('message', content)
    params.set('access_token', accessToken)
    const linkUrl = ctx.version.platformVariables.fb_link_url
    if (linkUrl) params.set('link', linkUrl)
    const feed = await graphRequest<{ id: string; post_id?: string }>(`/${pageId}/feed`, params)
    platformPostId = feed.post_id ?? feed.id
  }

  return {
    platformPostId,
    url: `https://facebook.com/${platformPostId}`,
    publishedAt: new Date(),
  }
}
