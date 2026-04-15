import type { BillingProvider, BillingProviderName } from './types'
import { stripe } from './providers/stripe'
import { polar } from './providers/polar'
import { dodo } from './providers/dodo'
import { autumn } from './providers/autumn'
import { creem } from './providers/creem'
import { chargebee } from './providers/chargebee'

const NONE: BillingProvider = {
  name: 'none',
  async checkout(): Promise<{ url: string }> {
    throw new Error('Billing is not configured — set BILLING_PROVIDER to enable it.')
  },
  async portal(): Promise<{ url: string }> {
    throw new Error('Billing is not configured.')
  },
  async webhook(): Promise<Response> {
    return new Response('billing disabled', { status: 404 })
  },
  betterAuthPlugin() {
    return null
  },
}

const registry: Record<BillingProviderName, BillingProvider> = {
  stripe,
  polar,
  dodo,
  autumn,
  creem,
  chargebee,
  none: NONE,
}

function selected(): BillingProviderName {
  const raw = (process.env.BILLING_PROVIDER ?? 'none').toLowerCase() as BillingProviderName
  return raw in registry ? raw : 'none'
}

export function getBillingProvider(): BillingProvider {
  return registry[selected()]
}

export function getBillingProviderByName(name: string): BillingProvider | null {
  return (registry as Record<string, BillingProvider | undefined>)[name] ?? null
}

export function currentBillingProviderName(): BillingProviderName {
  return selected()
}

export type { BillingProvider, BillingProviderName, BillingContext, SubscriptionState } from './types'
