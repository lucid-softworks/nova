import { createFileRoute, Link, Outlet, redirect, useLocation } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { db, schema } from '~/server/db'
import { loadSessionContext } from '~/server/session.server'
import { cn } from '~/lib/utils'

type AdminStatus =
  | { ok: true; userName: string }
  | { ok: false; reason: 'unauthenticated' | 'forbidden' }

const getAdminStatus = createServerFn({ method: 'GET' }).handler(async (): Promise<AdminStatus> => {
  const ctx = await loadSessionContext()
  if (!ctx.user) return { ok: false, reason: 'unauthenticated' }
  const row = await db.query.user.findFirst({ where: eq(schema.user.id, ctx.user.id) })
  if (row?.role !== 'admin') return { ok: false, reason: 'forbidden' }
  return { ok: true, userName: ctx.user.name }
})

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const status = await getAdminStatus()
    if (!status.ok) {
      if (status.reason === 'unauthenticated') throw redirect({ to: '/login' })
      throw redirect({ to: '/' })
    }
    return { userName: status.userName }
  },
  component: AdminLayout,
})

const NAV = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/workspaces', label: 'Workspaces' },
  { to: '/admin/jobs', label: 'Jobs' },
  { to: '/admin/webhooks', label: 'Webhooks' },
] as const

function AdminLayout() {
  const { userName } = Route.useRouteContext()
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <div className="text-sm font-semibold text-neutral-900">SocialHub · Admin</div>
            <nav className="flex items-center gap-3 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    'text-neutral-600 hover:text-neutral-900',
                    pathname === n.to && 'font-semibold text-indigo-600',
                  )}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>{userName}</span>
            <Link to="/" className="text-indigo-600 hover:underline">
              ↩ App
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  )
}
