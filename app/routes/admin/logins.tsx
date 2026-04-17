import { createFileRoute } from '@tanstack/react-router'
import { Card } from '~/components/ui/card'
import { listAdminLoginAttempts, type AdminLoginAttemptRow } from '~/server/admin'

export const Route = createFileRoute('/admin/logins')({
  loader: async () => ({ attempts: await listAdminLoginAttempts() }),
  component: LoginsPage,
})

function LoginsPage() {
  const { attempts } = Route.useLoaderData()
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Sign-in attempts
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Every sign-in attempt, successful or failed. Last 200 entries.
        </p>
      </div>
      <Card>
        <div className="overflow-hidden rounded-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {attempts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    No sign-in attempts yet.
                  </td>
                </tr>
              ) : (
                attempts.map((a) => <AttemptRow key={a.id} row={a} />)
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function AttemptRow({ row }: { row: AdminLoginAttemptRow }) {
  const when = new Date(row.createdAt)
  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400" title={when.toISOString()}>
        {when.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100">
        {row.email ?? <span className="text-neutral-400">—</span>}
      </td>
      <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 font-mono">
        {row.ipAddress ?? '—'}
      </td>
      <td className="px-3 py-2">
        {row.success ? (
          <span className="rounded-full bg-green-50 dark:bg-green-950/40 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
            Success
          </span>
        ) : (
          <span className="rounded-full bg-red-50 dark:bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
            Failed
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
        {row.reason ?? <span className="text-neutral-400">—</span>}
      </td>
    </tr>
  )
}
