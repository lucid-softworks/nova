import { createFileRoute } from '@tanstack/react-router'
import { Card } from '~/components/ui/card'
import { listAdminAuditLog, type AdminAuditRow } from '~/server/admin'

export const Route = createFileRoute('/admin/audit')({
  loader: async () => ({ rows: await listAdminAuditLog() }),
  component: AuditPage,
})

function AuditPage() {
  const { rows } = Route.useLoaderData()

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Audit log
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Every admin action. Newest first. Last 200 entries.
        </p>
      </div>
      <Card>
        <div className="overflow-hidden rounded-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    No admin actions recorded yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => <AuditRow key={r.id} row={r} />)
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function AuditRow({ row }: { row: AdminAuditRow }) {
  const when = new Date(row.createdAt)
  const metadata = (() => {
    try {
      return JSON.parse(row.metadataJson) as Record<string, unknown>
    } catch {
      return {}
    }
  })()
  const metadataKeys = Object.keys(metadata)
  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400" title={when.toISOString()}>
        {when.toLocaleString()}
      </td>
      <td className="px-3 py-2">
        {row.actorName ? (
          <div>
            <div className="text-sm text-neutral-900 dark:text-neutral-100">{row.actorName}</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{row.actorEmail}</div>
          </div>
        ) : (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">(deleted user)</span>
        )}
      </td>
      <td className="px-3 py-2">
        <code className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-xs font-medium text-neutral-900 dark:text-neutral-100">
          {row.action}
        </code>
      </td>
      <td className="px-3 py-2 text-xs">
        {row.targetType ? (
          <span className="text-neutral-500 dark:text-neutral-400">
            {row.targetType}
            {row.targetId ? (
              <>
                {' '}
                <code className="text-neutral-700 dark:text-neutral-300">{row.targetId.slice(0, 8)}</code>
              </>
            ) : null}
          </span>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
        {metadataKeys.length === 0 ? (
          <span className="text-neutral-400">—</span>
        ) : (
          <code className="text-xs">{row.metadataJson}</code>
        )}
      </td>
    </tr>
  )
}
