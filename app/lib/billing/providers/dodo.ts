import DodoPayments from 'dodopayments'
import { dodopayments as dodoBAPlugin, checkout as dodoBACheckout, portal as dodoBAPortal, webhooks as dodoBAWebhooks } from '@dodopayments/better-auth'
import type { BillingContext, BillingProvider, CheckoutResult, PortalResult } from '../types'
import { findWorkspaceByCustomerId, upsertSubscription } from '../persist'

function client(): DodoPayments {
  const apiKey = process.env.DODO_API_KEY
  if (!apiKey) throw new Error('DODO_API_KEY not set')
  return new DodoPayments({ bearerToken: apiKey })
}

function productFor(plan: string): string {
  const env = `DODO_PRODUCT_${plan.toUpperCase()}`
  const id = process.env[env]
  if (!id) throw new Error(`${env} not set — cannot resolve Dodo product for "${plan}"`)
  return id
}

/**
 * Resolve (or create) a Dodo customer keyed on the workspace. Dodo's customer
 * model has no `external_id`, so we tag local rows with workspaceId in
 * `metadata` and search by email.
 */
async function resolveCustomerId(c: DodoPayments, ctx: BillingContext): Promise<string> {
  // Try existing record by email + workspace metadata first.
  const list = c.customers.list({ email: ctx.email })
  for await (const cust of list) {
    if (cust.metadata?.workspaceId === ctx.workspaceId) return cust.customer_id
  }
  const created = await c.customers.create({
    email: ctx.email,
    name: ctx.email,
    metadata: { workspaceId: ctx.workspaceId, userId: ctx.userId },
  })
  return created.customer_id
}

function mapStatus(
  s: string,
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'none' {
  switch (s) {
    case 'active':
      return 'active'
    case 'on_hold':
      return 'past_due'
    case 'cancelled':
    case 'expired':
      return 'canceled'
    case 'failed':
      return 'unpaid'
    default:
      return 'none'
  }
}

export const dodo: BillingProvider = {
  name: 'dodo',
  async checkout(ctx: BillingContext, plan: string): Promise<CheckoutResult> {
    const c = client()
    const productId = productFor(plan)
    const session = await c.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email: ctx.email },
      return_url: `${ctx.returnUrl}?billing=success`,
      metadata: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
      },
    })
    const url = session.checkout_url
    if (!url) throw new Error('Dodo returned no checkout URL')
    return { url }
  },
  async portal(ctx: BillingContext): Promise<PortalResult> {
    const c = client()
    const customerId = await resolveCustomerId(c, ctx)
    const session = await c.customers.customerPortal.create(customerId, {
      return_url: ctx.returnUrl,
    })
    return { url: session.link }
  },
  async webhook(req: Request): Promise<Response> {
    const secret = process.env.DODO_WEBHOOK_SECRET
    if (!secret) return new Response('misconfigured', { status: 500 })
    const body = await req.text()
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => {
      headers[k] = v
    })

    const c = client()
    let event
    try {
      event = await c.webhooks.unwrap(body, { headers, key: secret })
    } catch {
      return new Response('invalid signature', { status: 400 })
    }

    if (
      event.type === 'subscription.active' ||
      event.type === 'subscription.renewed' ||
      event.type === 'subscription.updated' ||
      event.type === 'subscription.plan_changed' ||
      event.type === 'subscription.cancelled' ||
      event.type === 'subscription.expired' ||
      event.type === 'subscription.failed' ||
      event.type === 'subscription.on_hold'
    ) {
      const sub = event.data
      const customerId = sub.customer.customer_id
      const metaWorkspace = sub.metadata?.workspaceId
      const wid =
        (typeof metaWorkspace === 'string' ? metaWorkspace : null) ??
        (await findWorkspaceByCustomerId('dodo', customerId))
      if (wid) {
        await upsertSubscription(wid, 'dodo', {
          customerId,
          subscriptionId: sub.subscription_id,
          plan: sub.product_id,
          status: mapStatus(String(sub.status)),
          currentPeriodEnd: sub.next_billing_date ? new Date(sub.next_billing_date) : null,
          metadata: { productId: sub.product_id },
        })
      }
    }
    return new Response('ok', { status: 200 })
  },
  betterAuthPlugin() {
    const apiKey = process.env.DODO_API_KEY
    const webhookSecret = process.env.DODO_WEBHOOK_SECRET
    if (!apiKey) return null
    const c = new DodoPayments({ bearerToken: apiKey })
    return dodoBAPlugin({
      client: c,
      use: [
        dodoBACheckout(),
        dodoBAPortal(),
        dodoBAWebhooks({ webhookKey: webhookSecret ?? '' }),
      ],
    })
  },
}
