import { createFileRoute, Outlet, redirect, useLocation } from '@tanstack/react-router'
import { useState } from 'react'
import { Megaphone, Wrench, X } from 'lucide-react'
import { setActiveWorkspace } from '~/server/auth-context'
import { useT } from '~/lib/i18n'
import type { SessionContext } from '~/server/auth-context'
import { Sidebar } from '~/components/layout/Sidebar'
import { TopBar } from '~/components/layout/TopBar'
import { ImpersonationBanner } from '~/components/layout/ImpersonationBanner'
import { RouteErrorBoundary } from '~/components/RouteErrorBoundary'
import { cn } from '~/lib/utils'

type LoaderCtx = { session: SessionContext }

export const Route = createFileRoute('/_dashboard/$workspaceSlug')({
  beforeLoad: async ({ context, params }) => {
    const { session } = context as LoaderCtx
    const ws = session.workspaces.find((w) => w.slug === params.workspaceSlug)
    if (!ws) {
      const first = session.workspaces[0]
      if (first) {
        throw redirect({ to: '/$workspaceSlug/compose', params: { workspaceSlug: first.slug } })
      }
      throw redirect({ to: '/onboarding' })
    }
    if (session.activeOrganizationId !== ws.organizationId) {
      await setActiveWorkspace({ data: { slug: ws.slug } })
    }
    return { workspace: ws, session }
  },
  component: WorkspaceLayout,
  errorComponent: RouteErrorBoundary,
})

const TITLE_KEYS = {
  compose: 'nav.compose',
  posts: 'nav.posts',
  calendar: 'nav.calendar',
  media: 'nav.media',
  templates: 'nav.templates',
  analytics: 'nav.analytics',
  accounts: 'nav.accounts',
  team: 'nav.team',
  settings: 'nav.settings',
  inbox: 'nav.inbox',
  activity: 'nav.activity',
  approvals: 'nav.approvals',
} as const

function WorkspaceLayout() {
  const t = useT()
  const { workspace, session } = Route.useRouteContext()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const path = location.pathname
  const segment = path.split('/').filter(Boolean)[1] ?? 'compose'
  const key = TITLE_KEYS[segment as keyof typeof TITLE_KEYS] ?? 'nav.compose'
  const title = t(key)

  if (!session.user) return null

  return (
    <div className="flex h-screen bg-[#f8f9fb] dark:bg-[#0b0d12]">
      <div className="hidden md:block">
        <Sidebar user={session.user} workspace={workspace} workspaces={session.workspaces} />
      </div>

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
        <div className="relative h-full">
          <Sidebar user={session.user} workspace={workspace} workspaces={session.workspaces} />
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

      <div className="flex flex-1 flex-col overflow-hidden">
        {session.impersonatedBy ? <ImpersonationBanner userName={session.user.name} /> : null}
        <TopBar title={title} workspaceSlug={workspace.slug} onOpenSidebar={() => setMobileOpen(true)} />
        <PlatformBanners platform={session.platform} />
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function PlatformBanners({
  platform,
}: {
  platform: SessionContext['platform']
}) {
  if (!platform.maintenanceMode && !platform.announcementBanner) return null
  return (
    <div className="space-y-1 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
      {platform.maintenanceMode ? (
        <div className="flex items-center gap-2 bg-yellow-100 dark:bg-yellow-950/50 px-4 py-2 text-sm text-yellow-900 dark:text-yellow-200">
          <Wrench className="h-4 w-4 shrink-0" />
          <span>
            <strong>Maintenance mode is on.</strong> Most write actions are disabled while the
            platform is being worked on.
          </span>
        </div>
      ) : null}
      {platform.announcementBanner ? (
        <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-2 text-sm text-indigo-900 dark:text-indigo-200">
          <Megaphone className="h-4 w-4 shrink-0" />
          <span>{platform.announcementBanner}</span>
        </div>
      ) : null}
    </div>
  )
}
