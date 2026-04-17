import { Link } from '@tanstack/react-router'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import type { WorkspaceSummary } from '~/server/auth-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown'
import { useT } from '~/lib/i18n'

export function WorkspaceSwitcher({
  current,
  all,
}: {
  current: WorkspaceSummary
  all: WorkspaceSummary[]
}) {
  const t = useT()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-2 rounded-md bg-white/5 px-2 py-2 text-left text-sm text-white hover:bg-white/10"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-500 text-xs font-semibold">
            {current.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 truncate">{current.name}</div>
          <ChevronsUpDown className="h-4 w-4 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {all.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link to="/$workspaceSlug/compose" params={{ workspaceSlug: w.slug }}>
              <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-100 text-xs font-semibold text-indigo-600">
                {w.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === current.id ? <Check className="h-4 w-4 text-indigo-500" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/onboarding" className="text-indigo-600">
            <Plus className="h-4 w-4" />
            {t('nav.createNewWorkspace')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
