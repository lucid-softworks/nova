import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { listAdminUsers, type AdminUserRow } from '~/server/admin'
import { authClient } from '~/lib/auth-client'
import { cn } from '~/lib/utils'

export const Route = createFileRoute('/admin/users')({
  loader: async () => ({ users: await listAdminUsers() }),
  component: UsersPage,
})

function UsersPage() {
  const initial = Route.useLoaderData()
  const [rows, setRows] = useState<AdminUserRow[]>(initial.users)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const reload = async () => setRows(await listAdminUsers())

  const onBan = async (u: AdminUserRow) => {
    const reason = prompt(`Ban ${u.email}?\n\nOptional reason:`)
    if (reason === null) return
    setBusy(u.id)
    try {
      await authClient.admin.banUser({ userId: u.id, banReason: reason || 'Admin ban' })
      await reload()
    } finally {
      setBusy(null)
    }
  }
  const onUnban = async (u: AdminUserRow) => {
    setBusy(u.id)
    try {
      await authClient.admin.unbanUser({ userId: u.id })
      await reload()
    } finally {
      setBusy(null)
    }
  }
  const onImpersonate = async (u: AdminUserRow) => {
    setBusy(u.id)
    try {
      await authClient.admin.impersonateUser({ userId: u.id })
      window.location.href = '/'
    } finally {
      setBusy(null)
    }
  }

  const filtered = rows.filter((r) => {
    const q = filter.toLowerCase()
    return !q || r.email.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-3">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name or email"
        className="max-w-sm"
      />
      <Card>
        <div className="overflow-hidden rounded-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">{u.name}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{u.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        u.role === 'admin'
                          ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200',
                      )}
                    >
                      {u.role ?? 'user'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {u.banned ? (
                      <span className="rounded-full bg-red-50 dark:bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                        Banned
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onImpersonate(u)}
                        disabled={busy === u.id}
                      >
                        {busy === u.id ? <Spinner /> : null} Impersonate
                      </Button>
                      {u.banned ? (
                        <Button size="sm" variant="outline" onClick={() => onUnban(u)} disabled={busy === u.id}>
                          Unban
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => onBan(u)}
                          disabled={busy === u.id}
                        >
                          Ban
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
