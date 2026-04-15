import { PublishError } from '../errors'
import type { PublishResult, ReshareContext } from '../index'

function instanceUrl(ctx: ReshareContext): string {
  const raw =
    (ctx.account.metadata.instance as string | undefined) ??
    (ctx.account.metadata.instanceUrl as string | undefined) ??
    ''
  if (!raw) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'Mastodon account missing instance URL',
      userMessage: 'Mastodon account not connected properly — reconnect.',
      retryable: false,
    })
  }
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

export async function resharePost(ctx: ReshareContext): Promise<PublishResult> {
  const base = instanceUrl(ctx)
  const token = ctx.account.accessToken
  const sourceId = ctx.reshare.sourcePostId

  // Mastodon can "boost" (reblog) or quote via a reply. Plain reblog covers
  // 'boost'/'repost'/'share' intents; quote falls back to a status that
  // references the source URL.
  if (ctx.reshare.reshareType === 'quote') {
    const content = ctx.reshare.quoteComment
      ? `${ctx.reshare.quoteComment}\n\n${ctx.reshare.sourcePostUrl}`
      : ctx.reshare.sourcePostUrl
    const res = await fetch(`${base}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: content, visibility: 'public' }),
    })
    if (!res.ok) {
      throw new PublishError({
        code: 'UNKNOWN',
        message: `Mastodon quote failed (${res.status})`,
        userMessage: 'Mastodon quote post failed.',
      })
    }
    const json = (await res.json()) as { id: string; url: string; created_at: string }
    return { platformPostId: json.id, url: json.url, publishedAt: new Date(json.created_at) }
  }

  const res = await fetch(`${base}/api/v1/statuses/${encodeURIComponent(sourceId)}/reblog`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new PublishError({
      code: res.status === 401 ? 'AUTH_EXPIRED' : 'UNKNOWN',
      message: `Mastodon reblog ${res.status}`,
      userMessage: 'Mastodon boost failed.',
    })
  }
  const json = (await res.json()) as { id: string; url: string; created_at: string }
  return { platformPostId: json.id, url: json.url, publishedAt: new Date(json.created_at) }
}
