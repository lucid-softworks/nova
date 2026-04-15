import { Polar } from '@polar-sh/sdk'
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks'
import {
  polar as polarPlugin,
  checkout as polarBACheckout,
  portal as polarBAPortal,
  webhooks as polarBAWebhooks,
} from '@polar-sh/better-auth'
import type { BillingContext, BillingProvider, CheckoutResult, PortalResult } from '../types'
import { findWorkspaceByCustomerId, upsertSubscription } from '../persist'

function client(): Polar {
  const accessToken = process.env.POLAR_ACCESS_TOKEN
  if (!accessToken) throw new Error('POLAR_ACCESS_TOKEN not set')
  return new Polar({ accessToken })
}

function productFor(plan: string): string {
  const env = `POLAR_PRODUCT_${plan.toUpperCase()}`
  const id = process.env[env]
  if (!id) throw new Error(`${env} not set — cannot resolve Polar product for "${plan}"`)
  return id
}

/**
 * Map the Polar subscription status to the local SubscriptionState status enum.
 * Polar uses values like 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | …
 */
function mapStatus(s: string): 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'none' {
  switch (s) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
      return s
    default:
      return 'none'
  }
}

export const polar: BillingProvider = {
  name: 'polar',
  async checkout(ctx: BillingContext, plan: string): Promise<CheckoutResult> {
    const c = client()
    const productId = productFor(plan)
    const session = await c.checkouts.create({
      products: [productId],
      customerEmail: ctx.email,
      externalCustomerId: ctx.workspaceId,
      successUrl: `${ctx.returnUrl}?billing=success`,
      metadata: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
      },
    })
    if (!session.url) throw new Error('Polar returned no checkout URL')
    return { url: session.url }
  },
  async portal(ctx: BillingContext): Promise<PortalResult> {
    const c = client()
    // Make sure a customer with this externalId exists; ignore failure if it
    // already exists.
    try {
      await c.customers.create({
        email: ctx.email,
        externalId: ctx.workspaceId,
        metadata: { workspaceId: ctx.workspaceId, userId: ctx.userId },
      })
    } catch {
      // Most likely already exists — ignored.
    }
    const session = await c.customerSessions.create({
      externalCustomerId: ctx.workspaceId,
    })
    return { url: session.customerPortalUrl }
  },
  async webhook(req: Request): Promise<Response> {
    const secret = process.env.POLAR_WEBHOOK_SECRET
    if (!secret) return new Response('misconfigured', { status: 500 })
    const body = await req.text()
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => {
      headers[k] = v
    })

    let event
    try {
      event = validateEvent(body, headers, secret)
    } catch (e) {
      if (e instanceof WebhookVerificationError) {
        return new Response('invalid signature', { status: 400 })
      }
      return new Response('webhook error', { status: 400 })
    }

    switch (event.type) {
      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.active':
      case 'subscription.canceled':
      case 'subscription.revoked': {
        const sub = event.data
        const customerId = sub.customer.id
        const metaWorkspace = (sub.metadata as Record<string, unknown> | undefined)?.workspaceId
        const wid =
          (typeof metaWorkspace === 'string' ? metaWorkspace : null) ??
          (await findWorkspaceByCustomerId('polar', customerId))
        if (wid) {
          const status =
            event.type === 'subscription.revoked'
              ? 'canceled'
              : mapStatus(String(sub.status))
          await upsertSubscription(wid, 'polar', {
            customerId,
            subscriptionId: sub.id,
            plan: sub.productId,
            status,
            currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
            metadata: { productId: sub.productId },
          })
        }
        break
      }
    }
    return new Response('ok', { status: 200 })
  },
  betterAuthPlugin() {
    const accessToken = process.env.POLAR_ACCESS_TOKEN
    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET
    if (!accessToken) return null
    return polarPlugin({
      client: new Polar({ accessToken }),
      use: [
        polarBACheckout(),
        polarBAPortal(),
        polarBAWebhooks({ secret: webhookSecret ?? '' }),
      ],
    })
  },
}
