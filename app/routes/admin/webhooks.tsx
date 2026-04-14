import { createFileRoute } from '@tanstack/react-router'
import { Card } from '~/components/ui/card'
import { listAdminWebhookDeliveries } from '~/server/admin'

export const Route = createFileRoute('/admin/webhooks')({
  loader: async () => ({ deliveries: await listAdminWebhookDeliveries() }),
  component: WebhooksPage,
})

function WebhooksPage() {
  const { deliveries } = Route.useLoaderData()
  return (
    <Card>
      <div className="overflow-hidden rounded-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Workspace</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs text-neutral-500">
                  No webhook deliveries yet.
                </td>
              </tr>
            ) : (
              deliveries.map((d) => (
                <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{d.event}</td>
                  <td className="px-3 py-2 text-xs text-neutral-600">{d.workspaceName ?? '—'}</td>
                  <td className="px-3 py-2">
                    {d.success ? (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        ok
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        failed
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{d.statusCode ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
