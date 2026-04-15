import { Link } from '@tanstack/react-router'
import {
  PenSquare,
  LayoutList,
  CalendarDays,
  Image as ImageIcon,
  FileText,
  BarChart2,
  CheckCircle,
  History,
  Inbox,
  Link as LinkIcon,
  Users,
  Settings,
  LogOut,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import type { SessionUser, WorkspaceSummary } from '~/server/auth-context'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { authClient } from '~/lib/auth-client'

type NavItem = { label: string; to: string; icon: ComponentType<SVGProps<SVGSVGElement>> }
type NavSection = {
  label: string
  items: NavItem[]
  requiresRole?: readonly ('admin' | 'manager' | 'editor' | 'viewer')[]
}

const sections: NavSection[] = [
  {
    label: 'Publish',
    items: [
      { label: 'Compose', to: '/$workspaceSlug/compose', icon: PenSquare },
      { label: 'Posts', to: '/$workspaceSlug/posts', icon: LayoutList },
      { label: 'Calendar', to: '/$workspaceSlug/calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Review',
    items: [{ label: 'Approvals', to: '/$workspaceSlug/approvals', icon: CheckCircle }],
    requiresRole: ['admin', 'manager'] as const,
  },
  {
    label: 'Library',
    items: [
      { label: 'Media', to: '/$workspaceSlug/media', icon: ImageIcon },
      { label: 'Templates', to: '/$workspaceSlug/templates', icon: FileText },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Inbox', to: '/$workspaceSlug/inbox', icon: Inbox },
      { label: 'Analytics', to: '/$workspaceSlug/analytics', icon: BarChart2 },
      { label: 'Activity', to: '/$workspaceSlug/activity', icon: History },
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'Accounts', to: '/$workspaceSlug/accounts', icon: LinkIcon },
      { label: 'Team', to: '/$workspaceSlug/team', icon: Users },
      { label: 'Settings', to: '/$workspaceSlug/settings', icon: Settings },
    ],
  },
]

export function Sidebar({
  user,
  workspace,
  workspaces,
}: {
  user: SessionUser
  workspace: WorkspaceSummary
  workspaces: WorkspaceSummary[]
}) {
  const appName = workspace.appName ?? 'SocialHub'
  const initials = user.name
    .split(' ')
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')

  const signOut = () => {
    authClient.signOut().then(() => {
      window.location.href = '/login'
    })
  }

  return (
    <aside className="flex h-full w-64 flex-col bg-[#0f1117] text-white">
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2 px-1 py-1">
          {workspace.logoUrl ? (
            <img src={workspace.logoUrl} alt="" className="h-7 w-7 rounded" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-500 text-xs font-semibold">
              {appName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-sm font-semibold">{appName}</div>
        </div>
        <WorkspaceSwitcher current={workspace} all={workspaces} />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {sections
          .filter(
            (s) => !s.requiresRole || s.requiresRole.includes(workspace.role),
          )
          .map((section) => (
          <div key={section.label}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} label={item.label} Icon={item.icon} slug={workspace.slug} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-2">
          {user.image ? (
            <img src={user.image} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
              {initials || '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-white/60">{user.email}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function NavLink({
  to,
  label,
  Icon,
  slug,
}: {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  slug: string
}) {
  return (
    <Link
      to={to}
      params={{ workspaceSlug: slug }}
      activeOptions={{ includeSearch: false }}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white/80 hover:bg-white/5 hover:text-white [&.active]:bg-indigo-500 [&.active]:text-white"
      activeProps={{ className: 'active' }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}
