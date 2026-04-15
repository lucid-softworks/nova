import { PublishError } from '../errors'
import { loadMediaBuffer } from '../helpers'
import type { PublishContext, PublishMedia, PublishResult } from '../index'

type MastodonStatus = { id: string; url: string; created_at: string }
type MastodonAttachment = { id: string; type: string }

function instanceUrl(ctx: PublishContext): string {
  const raw =
    (ctx.account.metadata.instance as string | undefined) ??
    (ctx.account.metadata.instanceUrl as string | undefined) ??
    ''
  if (!raw) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'Mastodon account missing instance URL in metadata',
      userMessage: 'Mastodon account not connected properly — reconnect.',
      retryable: false,
    })
  }
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

async function mastodonFetch(
  base: string,
  token: string,
  pathSuffix: string,
  init: RequestInit,
): Promise<Response> {
  const res = await fetch(`${base}${pathSuffix}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (res.status === 401 || res.status === 403) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: `Mastodon ${pathSuffix} ${res.status}`,
      userMessage: 'Mastodon token rejected — reconnect your account.',
      retryable: false,
    })
  }
  if (res.status === 429) {
    throw new PublishError({
      code: 'RATE_LIMITED',
      message: `Mastodon rate limited on ${pathSuffix}`,
      userMessage: 'Mastodon is rate limiting us — will retry shortly.',
      retryable: true,
    })
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new PublishError({
      code: res.status === 413 ? 'MEDIA_TOO_LARGE' : 'UNKNOWN',
      message: `Mastodon ${pathSuffix} ${res.status}: ${body.slice(0, 300)}`,
      userMessage: 'Mastodon publish failed.',
    })
  }
  return res
}

async function uploadAttachment(
  base: string,
  token: string,
  m: PublishMedia,
): Promise<MastodonAttachment> {
  const { buf, mime } = await loadMediaBuffer(m)
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), m.originalName)
  if (m.originalName) form.append('description', m.originalName.slice(0, 1500))
  const res = await mastodonFetch(base, token, '/api/v2/media', { method: 'POST', body: form })
  return (await res.json()) as MastodonAttachment
}

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const base = instanceUrl(ctx)
  const token = ctx.account.accessToken

  const attachmentIds: string[] = []
  for (const m of ctx.media.slice(0, 4)) {
    const att = await uploadAttachment(base, token, m)
    attachmentIds.push(att.id)
  }

  const sensitive = ctx.version.platformVariables.mastodon_sensitive === 'true'
  const spoiler = ctx.version.platformVariables.mastodon_spoiler_text ?? ''
  const visibility =
    (ctx.version.platformVariables.mastodon_visibility as
      | 'public'
      | 'unlisted'
      | 'private'
      | 'direct'
      | undefined) ?? 'public'

  const body: Record<string, unknown> = {
    status: ctx.version.content,
    visibility,
  }
  if (attachmentIds.length > 0) body.media_ids = attachmentIds
  if (sensitive) body.sensitive = true
  if (spoiler) body.spoiler_text = spoiler
  const replyTarget = ctx.version.platformVariables.replyToPostId
  if (replyTarget) body.in_reply_to_id = replyTarget

  const res = await mastodonFetch(base, token, '/api/v1/statuses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': ctx.version.id },
    body: JSON.stringify(body),
  })
  const first = (await res.json()) as MastodonStatus

  // Thread replies — Mastodon uses in_reply_to_id.
  let lastId = first.id
  if (ctx.version.isThread && ctx.version.threadParts.length > 1) {
    for (let i = 1; i < ctx.version.threadParts.length; i++) {
      const part = ctx.version.threadParts[i]!
      const r = await mastodonFetch(base, token, '/api/v1/statuses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `${ctx.version.id}:${i}`,
        },
        body: JSON.stringify({
          status: part.content,
          visibility,
          in_reply_to_id: lastId,
        }),
      })
      const next = (await r.json()) as MastodonStatus
      lastId = next.id
    }
  }

  return {
    platformPostId: first.id,
    url: first.url,
    publishedAt: new Date(first.created_at),
  }
}
