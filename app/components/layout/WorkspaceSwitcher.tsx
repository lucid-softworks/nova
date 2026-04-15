import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import type { WorkspaceSummary } from '~/server/auth-context'
import { cn } from '~/lib/utils'

export function WorkspaceSwitcher({
  current,
  all,
}: {
  current: WorkspaceSummary
  all: WorkspaceSummary[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 rounded-md bg-white/5 px-2 py-2 text-left text-sm text-white hover:bg-white/10"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-500 text-xs font-semibold">
          {current.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 truncate">{current.name}</div>
        <ChevronsUpDown className="h-4 w-4 opacity-60" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1 text-neutral-900 dark:text-neutral-100 shadow-lg">
          {all.map((w) => (
            <Link
              key={w.id}
              to="/$workspaceSlug/compose"
              params={{ workspaceSlug: w.slug }}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-100 text-xs font-semibold text-indigo-600">
                {w.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === current.id ? <Check className="h-4 w-4 text-indigo-500" /> : null}
            </Link>
          ))}
          <div className="my-1 h-px bg-neutral-100 dark:bg-neutral-800" />
          <Link
            to="/onboarding"
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-2 rounded px-2 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50',
            )}
          >
            <Plus className="h-4 w-4" />
            Create new workspace
          </Link>
        </div>
      ) : null}
    </div>
  )
}
