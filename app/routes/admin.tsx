import { createFileRoute, Link, Outlet, redirect, useLocation } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { useState, type ComponentType, type SVGProps } from 'react'
import {
  ArrowLeft,
  BarChart2,
  Building2,
  ClipboardList,
  Cog,
  Gauge,
  History,
  KeyRound,
  LayoutGrid,
  LogIn,
  Menu,
  Package,
  Shield,
  Users,
  Webhook,
  X,
} from 'lucide-react'
import { db, schema } from '~/server/db'
import { loadSessionContext } from '~/server/session.server'
import { RouteErrorBoundary } from '~/components/RouteErrorBoundary'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'

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
  errorComponent: RouteErrorBoundary,
})

type Item = {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  external?: boolean
}

const SECTIONS: { label: string; items: Item[] }[] = [
  {
    label: 'admin.nav.overview',
    items: [{ to: '/admin', label: 'admin.overview', icon: LayoutGrid }],
  },
  {
    label: 'admin.nav.people',
    items: [
      { to: '/admin/users', label: 'admin.users', icon: Users },
      { to: '/admin/workspaces', label: 'admin.workspaces', icon: Building2 },
    ],
  },
  {
    label: 'admin.nav.platform',
    items: [
      { to: '/admin/plans', label: 'admin.plans', icon: Package },
      { to: '/admin/settings', label: 'admin.settings', icon: Cog },
    ],
  },
  {
    label: 'admin.nav.operations',
    items: [
      { to: '/admin/jobs', label: 'admin.jobs', icon: Gauge },
      { to: '/api/admin/queues', label: 'admin.queues', icon: BarChart2, external: true },
      { to: '/admin/webhooks', label: 'admin.webhooks', icon: Webhook },
    ],
  },
  {
    label: 'admin.nav.security',
    items: [
      { to: '/admin/api-keys', label: 'admin.apiKeys', icon: KeyRound },
      { to: '/admin/logins', label: 'admin.logins', icon: LogIn },
      { to: '/admin/audit', label: 'admin.audit', icon: ClipboardList },
    ],
  },
]

function AdminLayout() {
  const t = useT()
  const { userName } = Route.useRouteContext()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="flex h-screen bg-[#f8f9fb] dark:bg-[#0b0d12]">
      <aside className="hidden md:flex h-full w-64 flex-col bg-[#0f1117] text-white">
        <AdminSidebarContent pathname={pathname} onNavigate={() => {}} />
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="relative flex h-full flex-col bg-[#0f1117] text-white">
          <AdminSidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute right-2 top-2 rounded p-1.5 text-white/70 hover:bg-white/10"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="-ml-1 rounded p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 md:hidden"
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {t('admin.console')}
              </div>
            </div>
            <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
              {userName}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}

function AdminSidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate: () => void
}) {
  const t = useT()
  return (
    <>
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <Shield className="h-5 w-5 text-amber-400" />
        <div>
          <div className="text-sm font-semibold">Nova</div>
          <div className="text-[10px] uppercase tracking-wider text-white/50">Admin</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {t(section.label as never)}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = !item.external && pathname === item.to
                const className = cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                  active
                    ? 'bg-indigo-500 text-white'
                    : 'text-white/80 hover:bg-white/5 hover:text-white',
                )
                return item.external ? (
                  <a
                    key={item.to}
                    href={item.to}
                    target="_blank"
                    rel="noreferrer"
                    className={className}
                    onClick={onNavigate}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{t(item.label as never)}</span>
                    <History className="h-3 w-3 text-white/40" />
                  </a>
                ) : (
                  <Link key={item.to} to={item.to} className={className} onClick={onNavigate}>
                    <item.icon className="h-4 w-4" />
                    {t(item.label as never)}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/5 px-3 py-3">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white/70 hover:bg-white/5 hover:text-white"
          onClick={onNavigate}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('admin.backToApp')}
        </Link>
      </div>
    </>
  )
}
