import { PublishError } from '../errors'
import type { PublishContext, PublishMedia, PublishResult } from '../index'

const BASE = 'https://api.pinterest.com/v5'

type PinResponse = { id: string; url?: string }

function buildMediaSource(media: PublishMedia): Record<string, unknown> {
  return { source_type: 'image_url', url: media.url }
}

function mapError(endpoint: string, status: number, body: string): PublishError {
  if (status === 401) {
    return new PublishError({
      code: 'AUTH_EXPIRED',
      message: `Pinterest ${endpoint} 401`,
      userMessage: 'Pinterest session expired — reconnect your account.',
      retryable: false,
    })
  }
  if (status === 429) {
    return new PublishError({
      code: 'RATE_LIMITED',
      message: `Pinterest rate limited on ${endpoint}`,
      userMessage: 'Pinterest is rate limiting us — will retry shortly.',
      retryable: true,
    })
  }
  if (status === 413) {
    return new PublishError({
      code: 'MEDIA_TOO_LARGE',
      message: `Pinterest ${endpoint} 413`,
      userMessage: 'Pinterest rejected the image as too large.',
      retryable: false,
    })
  }
  return new PublishError({
    code: 'UNKNOWN',
    message: `Pinterest ${endpoint} ${status}: ${body.slice(0, 400)}`,
    userMessage: 'Pinterest publish failed.',
  })
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const boardId =
    (ctx.account.metadata.boardId as string | undefined) ??
    ctx.version.platformVariables.pinterest_board_id
  if (!boardId) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'Pinterest pin missing board id',
      userMessage: 'Pinterest pin requires a board — select one before publishing.',
      retryable: false,
    })
  }

  const image = ctx.media.find((m) => m.mimeType.startsWith('image/'))
  if (!image) {
    throw new PublishError({
      code: 'INVALID_FORMAT',
      message: 'Pinterest pin requires an image',
      userMessage: 'Pinterest requires an image to pin.',
      retryable: false,
    })
  }

  const mediaSource = buildMediaSource(image)
  const title =
    ctx.version.platformVariables.pinterest_title ?? ctx.version.content.slice(0, 100)
  const body: Record<string, unknown> = {
    link: ctx.version.platformVariables.pinterest_link ?? null,
    title,
    description: ctx.version.content.slice(0, 500),
    board_id: boardId,
    media_source: mediaSource,
  }

  const endpoint = '/pins'
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.account.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw mapError(endpoint, res.status, await res.text())
  }
  const json = (await res.json()) as PinResponse
  return {
    platformPostId: json.id,
    url: json.url ?? `https://www.pinterest.com/pin/${json.id}/`,
    publishedAt: new Date(),
  }
}
