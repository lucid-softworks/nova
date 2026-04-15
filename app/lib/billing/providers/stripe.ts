import Stripe from 'stripe'
import { stripe as stripePlugin } from '@better-auth/stripe'
import type { BillingContext, BillingProvider, CheckoutResult, PortalResult } from '../types'
import { findWorkspaceByCustomerId, upsertSubscription } from '../persist'

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  return new Stripe(key)
}

function priceFor(plan: string): string {
  const env = `STRIPE_PRICE_${plan.toUpperCase()}`
  const id = process.env[env]
  if (!id) throw new Error(`${env} not set — cannot resolve Stripe price for "${plan}"`)
  return id
}

async function resolveCustomer(ctx: BillingContext): Promise<string> {
  const s = client()
  // Stripe lets us search by metadata; we key customers by workspaceId.
  const existing = await s.customers.list({ email: ctx.email, limit: 1 })
  const found = existing.data.find((c) => c.metadata?.workspaceId === ctx.workspaceId)
  if (found) return found.id
  const created = await s.customers.create({
    email: ctx.email,
    metadata: { workspaceId: ctx.workspaceId, userId: ctx.userId },
  })
  return created.id
}

async function persistFromSubscription(
  sub: Stripe.Subscription,
  workspaceId: string,
): Promise<void> {
  const item = sub.items.data[0]
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end
  await upsertSubscription(workspaceId, 'stripe', {
    customerId,
    subscriptionId: sub.id,
    plan: item?.price.lookup_key ?? item?.price.id ?? null,
    status: sub.status as never,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    metadata: { priceId: item?.price.id },
  })
}

export const stripe: BillingProvider = {
  name: 'stripe',
  async checkout(ctx: BillingContext, plan: string): Promise<CheckoutResult> {
    const s = client()
    const customer = await resolveCustomer(ctx)
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: priceFor(plan), quantity: 1 }],
      success_url: `${ctx.returnUrl}?billing=success`,
      cancel_url: `${ctx.returnUrl}?billing=cancelled`,
      client_reference_id: ctx.workspaceId,
    })
    if (!session.url) throw new Error('Stripe returned no checkout URL')
    return { url: session.url }
  },
  async portal(ctx: BillingContext): Promise<PortalResult> {
    const s = client()
    const customer = await resolveCustomer(ctx)
    const session = await s.billingPortal.sessions.create({
      customer,
      return_url: ctx.returnUrl,
    })
    return { url: session.url }
  },
  async webhook(req: Request): Promise<Response> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) return new Response('misconfigured', { status: 500 })
    const sig = req.headers.get('stripe-signature')
    if (!sig) return new Response('missing signature', { status: 400 })
    const body = await req.text()
    const s = client()
    let event: Stripe.Event
    try {
      event = s.webhooks.constructEvent(body, sig, secret)
    } catch {
      return new Response('invalid signature', { status: 400 })
    }

    const workspaceIdFromEvent = async (customerId: string | null): Promise<string | null> => {
      if (!customerId) return null
      return findWorkspaceByCustomerId('stripe', customerId)
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const sess = event.data.object as Stripe.Checkout.Session
        const wid = sess.client_reference_id
        if (wid && typeof sess.subscription === 'string') {
          const sub = await s.subscriptions.retrieve(sess.subscription)
          await persistFromSubscription(sub, wid)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
        const wid = await workspaceIdFromEvent(customerId)
        if (wid) await persistFromSubscription(sub, wid)
        break
      }
    }
    return new Response('ok', { status: 200 })
  },
  betterAuthPlugin() {
    const key = process.env.STRIPE_SECRET_KEY
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!key) return null
    return stripePlugin({
      stripeClient: client(),
      stripeWebhookSecret: webhookSecret ?? '',
      createCustomerOnSignUp: false,
    })
  },
}
