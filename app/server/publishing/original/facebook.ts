import { loadMediaBuffer, loadMediaRange } from '../helpers'
import { PublishError } from '../errors'
import type { PublishContext, PublishMedia, PublishResult } from '../index'

const GRAPH = 'https://graph.facebook.com/v19.0'
const GRAPH_VIDEO = 'https://graph-video.facebook.com/v19.0'
const RESUMABLE_THRESHOLD = 250 * 1024 * 1024

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
  base: string = GRAPH,
): Promise<T> {
  const res = await fetch(`${base}${path}`, { method: 'POST', body })
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

type VideoStart = {
  upload_session_id: string
  video_id: string
  start_offset: string
  end_offset: string
}
type VideoTransfer = { start_offset: string; end_offset: string }

async function uploadVideoNonResumable(
  pageId: string,
  accessToken: string,
  media: PublishMedia,
  title: string,
  description: string,
): Promise<string> {
  const { buf, mime } = await loadMediaBuffer(media)
  const form = new FormData()
  form.append('source', new Blob([new Uint8Array(buf)], { type: mime }), media.originalName)
  form.append('title', title)
  form.append('description', description)
  form.append('access_token', accessToken)
  const r = await graphRequest<{ id: string }>(`/${pageId}/videos`, form, GRAPH_VIDEO)
  return r.id
}

async function uploadVideoResumable(
  pageId: string,
  accessToken: string,
  media: PublishMedia,
  title: string,
  description: string,
): Promise<string> {
  const startForm = new FormData()
  startForm.append('upload_phase', 'start')
  startForm.append('file_size', String(media.size))
  startForm.append('access_token', accessToken)
  const started = await graphRequest<VideoStart>(`/${pageId}/videos`, startForm, GRAPH_VIDEO)

  let start = Number(started.start_offset)
  let end = Number(started.end_offset)
  while (start < end) {
    const chunk = await loadMediaRange(media, start, end - 1)
    const form = new FormData()
    form.append('upload_phase', 'transfer')
    form.append('upload_session_id', started.upload_session_id)
    form.append('start_offset', String(start))
    form.append('access_token', accessToken)
    form.append(
      'video_file_chunk',
      new Blob([new Uint8Array(chunk)], { type: media.mimeType }),
      media.originalName,
    )
    const next = await graphRequest<VideoTransfer>(`/${pageId}/videos`, form, GRAPH_VIDEO)
    start = Number(next.start_offset)
    end = Number(next.end_offset)
  }

  const finish = new FormData()
  finish.append('upload_phase', 'finish')
  finish.append('upload_session_id', started.upload_session_id)
  finish.append('title', title)
  finish.append('description', description)
  finish.append('access_token', accessToken)
  await graphRequest<{ success: boolean }>(`/${pageId}/videos`, finish, GRAPH_VIDEO)
  return started.video_id
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

  let platformPostId: string

  if (videos.length > 0) {
    const video = videos[0]!
    const description = ctx.version.platformVariables.fb_video_description ?? content
    const title =
      ctx.version.platformVariables.fb_video_title ?? content.slice(0, 100)
    const videoId =
      video.size > RESUMABLE_THRESHOLD
        ? await uploadVideoResumable(pageId, accessToken, video, title, description)
        : await uploadVideoNonResumable(pageId, accessToken, video, title, description)
    platformPostId = videoId
  } else if (images.length === 1) {
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
