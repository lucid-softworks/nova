import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { useConfirm } from '~/components/ui/confirm'
import { Input } from '~/components/ui/input'
import { listAdminApiKeys, revokeAdminApiKey, type AdminApiKeyRow } from '~/server/admin'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/admin/api-keys')({
  loader: async () => ({ keys: await listAdminApiKeys() }),
  component: ApiKeysPage,
})

function ApiKeysPage() {
  const t = useT()
  const confirm = useConfirm()
  const initial = Route.useLoaderData()
  const [rows, setRows] = useState<AdminApiKeyRow[]>(initial.keys)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const onRevoke = async (k: AdminApiKeyRow) => {
    const ok = await confirm({
      message: `Revoke key ${k.display}? This cannot be undone.`,
      destructive: true,
      confirmLabel: 'Revoke',
    })
    if (!ok) return
    setBusy(k.id)
    try {
      await revokeAdminApiKey({ data: { keyId: k.id } })
      setRows(await listAdminApiKeys())
    } finally {
      setBusy(null)
    }
  }

  const filtered = rows.filter((r) => {
    const q = filter.toLowerCase()
    return (
      !q ||
      r.display.toLowerCase().includes(q) ||
      r.name?.toLowerCase().includes(q) ||
      r.ownerEmail?.toLowerCase().includes(q) ||
      r.workspaceName?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{t('admin.apiKeysTitle')}</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Keys across every workspace. Full key values are never displayed — only the
          prefix. Revoking deletes the row immediately.
        </p>
      </div>
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by key, owner email, or workspace"
        className="max-w-md"
      />
      <Card>
        <div className="overflow-x-auto rounded-md">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                <th className="px-3 py-2">{t('admin.col.key')}</th>
                <th className="px-3 py-2">{t('admin.col.owner')}</th>
                <th className="px-3 py-2">{t('admin.col.workspace')}</th>
                <th className="px-3 py-2">{t('admin.col.lastUsed')}</th>
                <th className="px-3 py-2">{t('admin.col.requests')}</th>
                <th className="px-3 py-2">{t('admin.col.created')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    No keys match.
                  </td>
                </tr>
              ) : (
                filtered.map((k) => (
                  <tr key={k.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs text-neutral-900 dark:text-neutral-100">
                        {k.display}
                      </div>
                      {k.name ? (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{k.name}</div>
                      ) : null}
                      {!k.enabled ? (
                        <span className="text-xs text-red-600">disabled</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {k.ownerName ? (
                        <div>
                          <div className="text-sm text-neutral-900 dark:text-neutral-100">
                            {k.ownerName}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            {k.ownerEmail}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400">(deleted user)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {k.workspaceName ?? <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {k.lastRequest ? new Date(k.lastRequest).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {k.requestCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        onClick={() => onRevoke(k)}
                        disabled={busy === k.id}
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
