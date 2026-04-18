import { createFileRoute } from '@tanstack/react-router'
import { toast } from '~/components/ui/toast'
import { useState } from 'react'
import { ChevronDown, Download, Plug, RotateCw } from 'lucide-react'
import { listAccounts, listAvailablePlatforms, disconnectAccount, type AccountSummary } from '~/server/accounts'
import { backfillBluesky, type BackfillResult } from '~/server/backfill'
import { PLATFORM_KEYS, PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { Card, CardContent } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { useConfirm } from '~/components/ui/confirm'
import { Spinner } from '~/components/ui/spinner'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { StatusBadge } from '~/components/accounts/StatusBadge'
import { AddAccountDialog } from '~/components/accounts/AddAccountDialog'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/accounts')({
  loader: async ({ params }) => ({
    accounts: await listAccounts({ data: { workspaceSlug: params.workspaceSlug } }),
    availablePlatforms: await listAvailablePlatforms(),
  }),
  component: AccountsPage,
})

function AccountsPage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const [accounts, setAccounts] = useState<AccountSummary[]>(initial.accounts)
  const [expanded, setExpanded] = useState<Set<PlatformKey>>(
    () => new Set(accounts.map((a) => a.platform)),
  )

  const reload = async () => {
    const fresh = await listAccounts({ data: { workspaceSlug } })
    setAccounts(fresh)
  }

  const togglePlatform = (p: PlatformKey) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const byPlatform = groupByPlatform(accounts)
  const counts: Partial<Record<PlatformKey, number>> = {}
  for (const [k, v] of Object.entries(byPlatform)) {
    counts[k as PlatformKey] = v.length
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{t('accounts.connectedAccounts')}</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('accounts.linkPlatformsDesc')}</p>
        </div>
        <AddAccountDialog
          workspaceSlug={workspaceSlug}
          connectedCounts={counts}
          availablePlatforms={initial.availablePlatforms}
          onConnected={reload}
        />
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Plug className="mx-auto mb-3 h-8 w-8 text-neutral-300" />
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('accounts.noAccounts')}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('accounts.addAccountDesc')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {PLATFORM_KEYS.filter((p) => (byPlatform[p] ?? []).length > 0).map((p) => (
            <PlatformGroup
              key={p}
              platform={p}
              accounts={byPlatform[p] ?? []}
              expanded={expanded.has(p)}
              onToggle={() => togglePlatform(p)}
              onReload={reload}
              workspaceSlug={workspaceSlug}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PlatformGroup({
  platform,
  accounts,
  expanded,
  onToggle,
  onReload,
  workspaceSlug,
}: {
  platform: PlatformKey
  accounts: AccountSummary[]
  expanded: boolean
  onToggle: () => void
  onReload: () => Promise<void>
  workspaceSlug: string
}) {
  const p = PLATFORMS[platform]
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <PlatformIcon platform={platform} />
        <div className="flex-1">
          <div className="font-medium text-neutral-900 dark:text-neutral-100">{p.label}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </div>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-neutral-400 dark:text-neutral-500 transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded ? (
        <div className="border-t border-neutral-100 dark:border-neutral-800">
          {accounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              onReload={onReload}
              workspaceSlug={workspaceSlug}
            />
          ))}
        </div>
      ) : null}
    </Card>
  )
}

function AccountRow({
  account,
  onReload,
  workspaceSlug,
}: {
  account: AccountSummary
  onReload: () => Promise<void>
  workspaceSlug: string
}) {
  const t = useT()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const expiring = account.tokenExpiresAt
    ? new Date(account.tokenExpiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    : false

  const handleDisconnect = async () => {
    const ok = await confirm({
      message: t('accounts.disconnectConfirm'),
      destructive: true,
      confirmLabel: t('accounts.disconnect'),
    })
    if (!ok) return
    setBusy(true)
    try {
      await disconnectAccount({ data: { workspaceSlug, accountId: account.id } })
      await onReload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {account.avatarUrl ? (
        <img src={account.avatarUrl} alt="" className="h-9 w-9 rounded-full" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
          {initialsOf(account.accountName)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{account.accountName}</div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="truncate">@{account.accountHandle}</span>
          {account.lastSyncedAt ? <span>· Synced {fmtDate(account.lastSyncedAt)}</span> : null}
        </div>
      </div>
      {expiring && account.status === 'connected' ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 dark:bg-yellow-950/40 px-2 py-0.5 text-xs font-medium text-yellow-700">
          {t('accounts.tokenExpiring')}
        </span>
      ) : null}
      <StatusBadge status={account.status} />
      {account.platform === 'bluesky' && account.status === 'connected' ? (
        <BackfillButton workspaceSlug={workspaceSlug} accountId={account.id} />
      ) : null}
      {account.status === 'connected' ? (
        <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={busy}>
          {busy ? <Spinner /> : null}
          {t('accounts.disconnect')}
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          <RotateCw className="h-3 w-3" /> {t('accounts.reconnect')}
        </Button>
      )}
    </div>
  )
}

function BackfillButton({
  workspaceSlug,
  accountId,
}: {
  workspaceSlug: string
  accountId: string
}) {
  const t = useT()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BackfillResult | null>(null)

  const run = async () => {
    const ok = await confirm({
      message: t('accounts.backfillConfirm'),
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await backfillBluesky({
        data: { workspaceSlug, socialAccountId: accountId },
      })
      setResult(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backfill failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={run} disabled={busy}>
        {busy ? <Spinner /> : <Download className="h-3 w-3" />}
        {t('accounts.backfill')}
      </Button>
      {result ? (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {t('accounts.imported', { count: result.imported })} · {t('accounts.skipped', { count: result.skipped })}
        </span>
      ) : null}
    </>
  )
}

function groupByPlatform(list: AccountSummary[]) {
  const out: Partial<Record<PlatformKey, AccountSummary[]>> = {}
  for (const a of list) {
    ;(out[a.platform] ??= []).push(a)
  }
  return out
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?'
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
