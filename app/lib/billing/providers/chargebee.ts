import Chargebee from 'chargebee'
import type { BillingContext, BillingProvider, CheckoutResult, PortalResult } from '../types'
import type { SubscriptionState } from '../types'
import { findWorkspaceByCustomerId, upsertSubscription } from '../persist'

function client(): Chargebee {
  const site = process.env.CHARGEBEE_SITE
  const apiKey = process.env.CHARGEBEE_API_KEY
  if (!site) throw new Error('CHARGEBEE_SITE not set')
  if (!apiKey) throw new Error('CHARGEBEE_API_KEY not set')
  return new Chargebee({ site, apiKey })
}

function planFor(plan: string): string {
  const env = `CHARGEBEE_PLAN_${plan.toUpperCase()}`
  const id = process.env[env]
  if (!id) throw new Error(`${env} not set — cannot resolve Chargebee item price for "${plan}"`)
  return id
}

async function ensureCustomer(cb: Chargebee, ctx: BillingContext): Promise<void> {
  try {
    await cb.customer.create({ id: ctx.workspaceId, email: ctx.email })
  } catch {
    // Customer likely already exists; ignore.
  }
}

function mapStatus(s: string | undefined): SubscriptionState['status'] {
  switch (s) {
    case 'active':
    case 'non_renewing':
      return 'active'
    case 'in_trial':
      return 'trialing'
    case 'paused':
      return 'past_due'
    case 'cancelled':
      return 'canceled'
    default:
      return 'none'
  }
}

type SubscriptionPayload = {
  id: string
  customer_id?: string
  status?: string
  current_term_end?: number
  subscription_items?: Array<{ item_price_id?: string }>
  plan_id?: string
}

async function persistFromSubscription(
  sub: SubscriptionPayload,
  workspaceId: string,
): Promise<void> {
  const customerId = sub.customer_id ?? null
  const plan = sub.subscription_items?.[0]?.item_price_id ?? sub.plan_id ?? null
  await upsertSubscription(workspaceId, 'chargebee', {
    customerId,
    subscriptionId: sub.id,
    plan,
    status: mapStatus(sub.status),
    currentPeriodEnd: sub.current_term_end ? new Date(sub.current_term_end * 1000) : null,
    metadata: { rawStatus: sub.status ?? null },
  })
}

function verifyBasicAuth(req: Request): boolean {
  const user = process.env.CHARGEBEE_WEBHOOK_USER
  const pass = process.env.CHARGEBEE_WEBHOOK_PASSWORD
  if (!user || !pass) return false
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header || !header.toLowerCase().startsWith('basic ')) return false
  const encoded = header.slice(6).trim()
  const expected = Buffer.from(`${user}:${pass}`).toString('base64')
  return encoded === expected
}

export const chargebee: BillingProvider = {
  name: 'chargebee',
  async checkout(ctx: BillingContext, plan: string): Promise<CheckoutResult> {
    const cb = client()
    await ensureCustomer(cb, ctx)
    const itemPriceId = planFor(plan)
    const result = await cb.hostedPage.checkoutNewForItems({
      customer: { id: ctx.workspaceId },
      subscription_items: [{ item_price_id: itemPriceId }],
      redirect_url: ctx.returnUrl,
    })
    const url = result.hosted_page.url
    if (!url) throw new Error('Chargebee returned no hosted page URL')
    return { url }
  },
  async portal(ctx: BillingContext): Promise<PortalResult> {
    const cb = client()
    await ensureCustomer(cb, ctx)
    const result = await cb.portalSession.create({
      customer: { id: ctx.workspaceId },
      redirect_url: ctx.returnUrl,
    })
    return { url: result.portal_session.access_url }
  },
  async webhook(req: Request): Promise<Response> {
    if (!verifyBasicAuth(req)) {
      return new Response('unauthorized', { status: 401 })
    }
    let body: { event_type?: string; content?: Record<string, unknown> }
    try {
      body = (await req.json()) as typeof body
    } catch {
      return new Response('invalid payload', { status: 400 })
    }
    const eventType = body.event_type ?? ''
    if (!eventType.startsWith('subscription_')) {
      return new Response('ok', { status: 200 })
    }
    const content = body.content ?? {}
    const sub = content.subscription as SubscriptionPayload | undefined
    const customer = content.customer as { id?: string } | undefined
    const customerId = sub?.customer_id ?? customer?.id ?? null
    if (!sub || !customerId) {
      return new Response('ok', { status: 200 })
    }
    try {
      const wid = await findWorkspaceByCustomerId('chargebee', customerId)
      if (wid) await persistFromSubscription(sub, wid)
    } catch {
      return new Response('error', { status: 500 })
    }
    return new Response('ok', { status: 200 })
  },
  betterAuthPlugin() {
    return null
  },
}
