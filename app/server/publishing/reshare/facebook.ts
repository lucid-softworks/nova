import { PublishError } from '../errors'
import type { PublishResult, ReshareContext } from '../index'

const GRAPH = 'https://graph.facebook.com/v19.0'

type GraphError = {
  error?: {
    message?: string
    code?: number
    error_subcode?: number
  }
}

async function graphPost<T>(path: string, body: URLSearchParams): Promise<T> {
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
      userMessage: 'Facebook reshare failed.',
    })
  }
  return (await res.json()) as T
}

export async function resharePost(ctx: ReshareContext): Promise<PublishResult> {
  const pageId = ctx.account.metadata.pageId as string | undefined
  if (!pageId) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'Facebook account missing pageId',
      userMessage: 'Facebook page not connected properly — reconnect.',
      retryable: false,
    })
  }
  const params = new URLSearchParams()
  params.set('link', ctx.reshare.sourcePostUrl)
  params.set('message', ctx.reshare.quoteComment ?? '')
  params.set('access_token', ctx.account.accessToken)
  const res = await graphPost<{ id: string; post_id?: string }>(`/${pageId}/feed`, params)
  const platformPostId = res.post_id ?? res.id
  return {
    platformPostId,
    url: `https://facebook.com/${platformPostId}`,
    publishedAt: new Date(),
  }
}
