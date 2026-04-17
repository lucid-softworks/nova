import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { getAdminWorkspaceDetail, deleteAdminWorkspace } from '~/server/admin'

export const Route = createFileRoute('/admin/workspaces/$workspaceId')({
  loader: async ({ params }) =>
    getAdminWorkspaceDetail({ data: { workspaceId: params.workspaceId } }),
  component: WorkspaceDetailPage,
})

function WorkspaceDetailPage() {
  const ws = Route.useLoaderData()
  const navigate = useNavigate()

  const onDelete = async () => {
    if (!confirm(`Delete workspace "${ws.name}"? This cascades to every post, media asset, and connected account.`)) return
    await deleteAdminWorkspace({ data: { workspaceId: ws.id } })
    navigate({ to: '/admin/workspaces' })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          to="/admin/workspaces"
          className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" /> All workspaces
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {ws.logoUrl ? (
            <img src={ws.logoUrl} alt="" className="h-12 w-12 rounded-md" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-indigo-500 text-lg font-semibold text-white">
              {ws.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{ws.name}</h2>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              /{ws.slug} · Created {new Date(ws.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        <Button variant="outline" className="text-red-600" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete workspace
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Posts" value={ws.counts.posts} />
        <Stat label="Media" value={ws.counts.media} />
        <Stat label="Accounts" value={ws.counts.socialAccounts} />
        <Stat label="Campaigns" value={ws.counts.campaigns} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Members ({ws.members.length})
        </h3>
        <Card>
          <div className="overflow-hidden rounded-md">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {ws.members.map((m) => (
                  <tr key={m.userId} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">{m.name}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">{m.email}</div>
                    </td>
                    <td className="px-3 py-2 text-sm">{m.role}</td>
                    <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {new Date(m.joinedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {ws.members.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                      No members.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <div className="p-3">
        <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          {label}
        </div>
        <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</div>
      </div>
    </Card>
  )
}
