import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ChevronDown, Menu, Share2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { NotificationBell } from './NotificationBell'
import { ReshareBrowser, type ReshareAccount } from '~/components/reshare/ReshareBrowser'
import { listAccounts } from '~/server/accounts'

export function TopBar({
  title,
  workspaceSlug,
  onOpenSidebar,
}: {
  title: string
  workspaceSlug: string
  onOpenSidebar: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [reshareOpen, setReshareOpen] = useState(false)
  const [accounts, setAccounts] = useState<ReshareAccount[]>([])

  useEffect(() => {
    if (!reshareOpen) return
    let cancelled = false
    listAccounts({ data: { workspaceSlug } })
      .then((rows) => {
        if (cancelled) return
        setAccounts(
          rows
            .filter((a) => a.status === 'connected')
            .map((a) => ({
              id: a.id,
              platform: a.platform,
              accountHandle: a.accountHandle,
              accountName: a.accountName,
            })),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reshareOpen, workspaceSlug])

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 md:px-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="md:hidden rounded p-2 hover:bg-neutral-100"
          onClick={onOpenSidebar}
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-neutral-900">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />

        <div className="relative flex">
          <Button asChild className="rounded-r-none">
            <Link to="/$workspaceSlug/compose" params={{ workspaceSlug }}>
              New Post
            </Link>
          </Button>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-l-none rounded-r-md bg-indigo-500 px-2 text-white hover:bg-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="More post actions"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-md border border-neutral-200 bg-white p-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setReshareOpen(true)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-100"
              >
                <Share2 className="h-4 w-4" /> Queue Reshares
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <ReshareBrowser
        open={reshareOpen}
        onClose={() => setReshareOpen(false)}
        workspaceSlug={workspaceSlug}
        accounts={accounts}
      />
    </header>
  )
}
