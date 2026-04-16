import { createHmac } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from './db'
import { safeFetch } from '~/lib/safe-fetch'

export type WebhookEvent =
  | 'post.published'
  | 'post.failed'
  | 'post.scheduled'
  | 'post.approved'
  | 'post.rejected'
  | 'campaign.on_hold'

type WebhookPayload = {
  event: WebhookEvent
  timestamp: string
  data: Record<string, unknown>
}

const TIMEOUT_MS = 10_000

function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

/**
 * Find all active webhooks in the workspace subscribed to the event, POST the
 * signed payload to each, and record every attempt in webhook_deliveries.
 * Fire-and-forget: callers don't await per-hook success.
 */
export async function publishWebhookEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
) {
  const hooks = await db
    .select()
    .from(schema.webhooks)
    .where(
      and(
        eq(schema.webhooks.workspaceId, workspaceId),
        eq(schema.webhooks.isActive, true),
        sql`${schema.webhooks.events} @> ARRAY[${event}]::text[]`,
      ),
    )
  if (hooks.length === 0) return

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  }
  const body = JSON.stringify(payload)

  for (const hook of hooks) {
    void deliverOnce(hook.id, hook.url, hook.secret, event, body).catch(() => {})
  }
}

async function deliverOnce(
  webhookId: string,
  url: string,
  secret: string,
  event: WebhookEvent,
  body: string,
  attempt = 1,
) {
  const signature = signPayload(secret, body)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let statusCode: number | null = null
  let responseBody: string | null = null
  let success = false
  try {
    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SocialHub-Signature': `sha256=${signature}`,
        'X-SocialHub-Event': event,
        'User-Agent': 'SocialHub-Webhooks/1',
      },
      body,
      signal: controller.signal,
    })
    statusCode = res.status
    responseBody = await res.text().then((t) => t.slice(0, 2000)).catch(() => null)
    success = res.ok
  } catch (e) {
    responseBody = e instanceof Error ? e.message.slice(0, 500) : 'fetch error'
  } finally {
    clearTimeout(timer)
  }

  await db.insert(schema.webhookDeliveries).values({
    webhookId,
    event,
    payload: JSON.parse(body) as Record<string, unknown>,
    statusCode,
    responseBody,
    success,
    attemptCount: attempt,
    deliveredAt: success ? new Date() : null,
  })

  if (!success && attempt < 3) {
    const delayMs = attempt === 1 ? 30_000 : attempt === 2 ? 120_000 : 600_000
    setTimeout(() => {
      void deliverOnce(webhookId, url, secret, event, body, attempt + 1).catch(() => {})
    }, delayMs)
  }
}
