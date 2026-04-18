import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import { authClient } from '~/lib/auth-client'

export function ImpersonationBanner({ userName }: { userName: string }) {
  const [busy, setBusy] = useState(false)
  const stop = async () => {
    setBusy(true)
    try {
      await authClient.admin.stopImpersonating()
      // Hard reload so the whole session/router state is refreshed.
      window.location.href = '/'
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center gap-3 border-b border-amber-200 dark:border-amber-900/60 bg-amber-100 dark:bg-amber-950/60 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
      <UserCheck className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        You're impersonating <strong>{userName}</strong>. Every action below is performed as
        them.
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={busy}
        className="rounded-md bg-amber-900 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
      >
        {busy ? 'Stopping…' : 'Stop impersonating'}
      </button>
    </div>
  )
}
