import { createFileRoute } from '@tanstack/react-router'
import { getBillingProviderByName } from '~/lib/billing'

export const Route = createFileRoute('/api/billing/webhook/$provider')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const provider = getBillingProviderByName(params.provider)
        if (!provider || provider.name === 'none') {
          return new Response('unknown provider', { status: 404 })
        }
        return provider.webhook(request)
      },
    },
  },
})
