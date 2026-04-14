import { createFileRoute } from '@tanstack/react-router'
import { Card } from '~/components/ui/card'
import {
  getAdminJobStats,
  listAdminUsers,
  listAdminWorkspaces,
} from '~/server/admin'

export const Route = createFileRoute('/admin/')({
  loader: async () => {
    const [users, workspaces, jobs] = await Promise.all([
      listAdminUsers(),
      listAdminWorkspaces(),
      getAdminJobStats(),
    ])
    return { users: users.length, workspaces: workspaces.length, jobs }
  },
  component: AdminOverview,
})

function AdminOverview() {
  const { users, workspaces, jobs } = Route.useLoaderData()
  const cards = [
    { label: 'Users', value: users },
    { label: 'Workspaces', value: workspaces },
    { label: 'Jobs waiting', value: jobs.waiting },
    { label: 'Jobs active', value: jobs.active },
    { label: 'Jobs failed', value: jobs.failed },
    { label: 'Jobs completed', value: jobs.completed },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <div className="space-y-1 p-3">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">{c.label}</div>
            <div className="text-xl font-semibold text-neutral-900">{c.value}</div>
          </div>
        </Card>
      ))}
    </div>
  )
}
