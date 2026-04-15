import { Creem } from 'creem'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { BillingContext, BillingProvider, CheckoutResult, PortalResult } from '../types'
import type { SubscriptionState } from '../types'
import { findWorkspaceByCustomerId, upsertSubscription } from '../persist'

function client(): Creem {
  const apiKey = process.env.CREEM_API_KEY
  if (!apiKey) throw new Error('CREEM_API_KEY not set')
  return new Creem({ apiKey })
}

function productFor(plan: string): string {
  const env = `CREEM_PRODUCT_${plan.toUpperCase()}`
  const id = process.env[env]
  if (!id) throw new Error(`${env} not set — cannot resolve Creem product for "${plan}"`)
  return id
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

type CreemSubscriptionPayload = {
  id?: string
  status?: string
  customer?: string | { id?: string }
  product?: string | { id?: string }
  current_period_end_date?: string
  currentPeriodEndDate?: string
}

function customerIdOf(c: CreemSubscriptionPayload['customer']): string | null {
  if (!c) return null
  return typeof c === 'string' ? c : c.id ?? null
}

function productIdOf(p: CreemSubscriptionPayload['product']): string | null {
  if (!p) return null
  return typeof p === 'string' ? p : p.id ?? null
}

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature.replace(/^sha256=/, ''), 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const creem: BillingProvider = {
  name: 'creem',
  async checkout(ctx: BillingContext, plan: string): Promise<CheckoutResult> {
    const c = client()
    const productId = productFor(plan)
    const session = await c.checkouts.create({
      productId,
      requestId: ctx.workspaceId,
      successUrl: `${ctx.returnUrl}?billing=success`,
      customer: { email: ctx.email },
      metadata: { workspaceId: ctx.workspaceId, userId: ctx.userId },
    })
    if (!session.checkoutUrl) throw new Error('Creem returned no checkout URL')
    return { url: session.checkoutUrl }
  },
  async portal(ctx: BillingContext): Promise<PortalResult> {
    const c = client()
    const customer = await c.customers.retrieve(undefined, ctx.email)
    if (!customer.id) throw new Error('Creem customer not found for portal')
    const links = await c.customers.generateBillingLinks({ customerId: customer.id })
    return { url: links.customerPortalLink }
  },
  async webhook(req: Request): Promise<Response> {
    const secret = process.env.CREEM_WEBHOOK_SECRET
    if (!secret) return new Response('misconfigured', { status: 500 })
    const sig =
      req.headers.get('creem-signature') ?? req.headers.get('x-creem-signature')
    const body = await req.text()
    if (!verifySignature(body, sig, secret)) {
      return new Response('invalid signature', { status: 400 })
    }
    let event: { eventType?: string; type?: string; object?: unknown }
    try {
      event = JSON.parse(body) as typeof event
    } catch {
      return new Response('invalid payload', { status: 400 })
    }
    const type = event.eventType ?? event.type ?? ''
    if (!type.startsWith('subscription')) {
      return new Response('ok', { status: 200 })
    }
    const sub = event.object as CreemSubscriptionPayload | undefined
    if (!sub) return new Response('ok', { status: 200 })
    const customerId = customerIdOf(sub.customer)
    if (!customerId) return new Response('ok', { status: 200 })
    try {
      const wid = await findWorkspaceByCustomerId('creem', customerId)
      if (wid) {
        const periodEnd = sub.current_period_end_date ?? sub.currentPeriodEndDate
        await upsertSubscription(wid, 'creem', {
          customerId,
          subscriptionId: sub.id ?? null,
          plan: productIdOf(sub.product),
          status: mapStatus(sub.status),
          currentPeriodEnd: periodEnd ? new Date(periodEnd) : null,
          metadata: { rawStatus: sub.status ?? null },
        })
      }
    } catch {
      return new Response('error', { status: 500 })
    }
    return new Response('ok', { status: 200 })
  },
  betterAuthPlugin() {
    return null
  },
}
