export type BillingProviderName =
  | 'stripe'
  | 'polar'
  | 'dodo'
  | 'autumn'
  | 'creem'
  | 'chargebee'
  | 'none'

export type BillingContext = {
  userId: string
  email: string
  workspaceId: string
  /** Absolute URL to return the user to after checkout / portal. */
  returnUrl: string
}

export type CheckoutResult = { url: string }

export type PortalResult = { url: string }

export type SubscriptionState = {
  provider: BillingProviderName
  /** Provider-specific customer id. */
  customerId: string | null
  /** Provider-specific subscription id. */
  subscriptionId: string | null
  plan: string | null
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'none'
  currentPeriodEnd: Date | null
}

export interface BillingProvider {
  readonly name: BillingProviderName
  /** Provider-facing plan identifier lookup. `plan` is the logical app plan
   * (e.g. 'pro', 'business') which the adapter maps to its provider id. */
  checkout(ctx: BillingContext, plan: string): Promise<CheckoutResult>
  portal(ctx: BillingContext): Promise<PortalResult>
  /**
   * Process a webhook request. Must verify the signature using whatever
   * secret env var the adapter expects, then update local subscription
   * state via `persist.upsertSubscription`. Returns a `Response` that the
   * webhook route hands back to the provider.
   */
  webhook(req: Request): Promise<Response>
  /**
   * Optional Better Auth plugin factory. Only Stripe / Polar / Dodo ship
   * one right now; other providers return `null` and rely solely on the
   * abstraction above.
   */
  betterAuthPlugin?(): unknown | null
}
