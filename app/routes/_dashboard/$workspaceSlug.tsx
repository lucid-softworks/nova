import { createFileRoute, Outlet, redirect, useLocation } from '@tanstack/react-router'
import { useState } from 'react'
import { X } from 'lucide-react'
import { setActiveWorkspace } from '~/server/auth-context'
import type { SessionContext } from '~/server/auth-context'
import { Sidebar } from '~/components/layout/Sidebar'
import { TopBar } from '~/components/layout/TopBar'
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
})

const TITLES: Record<string, string> = {
  compose: 'Compose',
  posts: 'Posts',
  calendar: 'Calendar',
  media: 'Media',
  templates: 'Templates',
  analytics: 'Analytics',
  accounts: 'Accounts',
  team: 'Team',
  settings: 'Settings',
}

function WorkspaceLayout() {
  const { workspace, session } = Route.useRouteContext()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const path = location.pathname
  const segment = path.split('/').filter(Boolean)[1] ?? 'compose'
  const title = TITLES[segment] ?? 'Dashboard'

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
        <TopBar title={title} workspaceSlug={workspace.slug} onOpenSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
