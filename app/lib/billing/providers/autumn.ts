import { Autumn } from 'autumn-js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { BillingContext, BillingProvider, CheckoutResult, PortalResult } from '../types'
import type { SubscriptionState } from '../types'
import { findWorkspaceByCustomerId, upsertSubscription } from '../persist'

function client(): Autumn {
  const secretKey = process.env.AUTUMN_SECRET_KEY
  if (!secretKey) throw new Error('AUTUMN_SECRET_KEY not set')
  return new Autumn({ secretKey })
}

function productFor(plan: string): string {
  const env = `AUTUMN_PRODUCT_${plan.toUpperCase()}`
  const id = process.env[env]
  if (!id) throw new Error(`${env} not set — cannot resolve Autumn product for "${plan}"`)
  return id
}

async function ensureCustomer(a: Autumn, ctx: BillingContext): Promise<void> {
  await a.customers.getOrCreate({ customerId: ctx.workspaceId, email: ctx.email })
}

function mapStatus(s: string | undefined): SubscriptionState['status'] {
  switch (s) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'cancelled':
      return 'canceled'
    case 'unpaid':
      return 'unpaid'
    default:
      return 'none'
  }
}

type AutumnSubscriptionPayload = {
  id?: string
  customer_id?: string
  customerId?: string
  product_id?: string
  productId?: string
  plan_id?: string
  status?: string
  current_period_end?: number | string
  currentPeriodEnd?: number | string
}

function extractSubscription(
  data: Record<string, unknown>,
): AutumnSubscriptionPayload | null {
  const sub = (data.subscription ?? data.object ?? data) as AutumnSubscriptionPayload
  if (!sub || typeof sub !== 'object') return null
  return sub
}

function toDate(v: number | string | undefined): Date | null {
  if (v == null) return null
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v)
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function verifyWebhook(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature.replace(/^sha256=/, ''), 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const autumn: BillingProvider = {
  name: 'autumn',
  async checkout(ctx: BillingContext, plan: string): Promise<CheckoutResult> {
    const a = client()
    await ensureCustomer(a, ctx)
    const planId = productFor(plan)
    const res = await a.billing.attach({
      customerId: ctx.workspaceId,
      planId,
      successUrl: `${ctx.returnUrl}?billing=success`,
    })
    if (!res.paymentUrl) throw new Error('Autumn returned no checkout URL')
    return { url: res.paymentUrl }
  },
  async portal(ctx: BillingContext): Promise<PortalResult> {
    const a = client()
    await ensureCustomer(a, ctx)
    const res = await a.billing.openCustomerPortal({
      customerId: ctx.workspaceId,
      returnUrl: ctx.returnUrl,
    })
    if (!res.url) throw new Error('Autumn billing portal not available')
    return { url: res.url }
  },
  async webhook(req: Request): Promise<Response> {
    const secret = process.env.AUTUMN_WEBHOOK_SECRET
    if (!secret) return new Response('misconfigured', { status: 500 })
    const sig =
      req.headers.get('autumn-signature') ?? req.headers.get('x-autumn-signature')
    const body = await req.text()
    if (!verifyWebhook(body, sig, secret)) {
      return new Response('invalid signature', { status: 400 })
    }
    let event: { type?: string; data?: Record<string, unknown> }
    try {
      event = JSON.parse(body) as typeof event
    } catch {
      return new Response('invalid payload', { status: 400 })
    }
    const type = event.type ?? ''
    if (!type.startsWith('subscription') && !type.startsWith('customer.subscription')) {
      return new Response('ok', { status: 200 })
    }
    const sub = extractSubscription(event.data ?? {})
    if (!sub) return new Response('ok', { status: 200 })
    const customerId = sub.customer_id ?? sub.customerId ?? null
    if (!customerId) return new Response('ok', { status: 200 })
    try {
      // In Autumn our workspaceId IS the customerId; double-check via persist.
      const wid =
        (await findWorkspaceByCustomerId('autumn', customerId)) ?? customerId
      const productId = sub.product_id ?? sub.productId ?? sub.plan_id ?? null
      await upsertSubscription(wid, 'autumn', {
        customerId,
        subscriptionId: sub.id ?? null,
        plan: productId,
        status: mapStatus(sub.status),
        currentPeriodEnd: toDate(sub.current_period_end ?? sub.currentPeriodEnd),
        metadata: { rawStatus: sub.status ?? null },
      })
    } catch {
      return new Response('error', { status: 500 })
    }
    return new Response('ok', { status: 200 })
  },
  betterAuthPlugin() {
    return null
  },
}
