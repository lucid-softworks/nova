import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import {
  listAdminWorkspaces,
  deleteAdminWorkspace,
  type AdminWorkspaceRow,
} from '~/server/admin'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/admin/workspaces/')({
  loader: async () => ({ workspaces: await listAdminWorkspaces() }),
  component: WorkspacesPage,
})

function WorkspacesPage() {
  const t = useT()
  const initial = Route.useLoaderData()
  const [rows, setRows] = useState<AdminWorkspaceRow[]>(initial.workspaces)

  const onDelete = async (w: AdminWorkspaceRow) => {
    if (!confirm(`Delete workspace "${w.name}"? Cascades to all posts, media, and accounts.`)) return
    await deleteAdminWorkspace({ data: { workspaceId: w.id } })
    setRows(await listAdminWorkspaces())
  }

  return (
    <Card>
      <div className="overflow-hidden rounded-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <th className="px-3 py-2">{t('admin.workspaces')}</th>
              <th className="px-3 py-2">{t('billing.members')}</th>
              <th className="px-3 py-2">{t('team.joined')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                <td className="px-3 py-2">
                  <Link
                    to="/admin/workspaces/$workspaceId"
                    params={{ workspaceId: w.id }}
                    className="block"
                  >
                    <div className="font-medium text-neutral-900 dark:text-neutral-100 hover:text-indigo-600">
                      {w.name}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">/{w.slug}</div>
                  </Link>
                </td>
                <td className="px-3 py-2">{w.memberCount}</td>
                <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {new Date(w.createdAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => onDelete(w)}
                  >
                    <Trash2 className="h-3 w-3" /> {t('common.delete')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
