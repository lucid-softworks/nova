import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { SettingsNav } from '~/components/settings/SettingsNav'
import {
  addRssFeed,
  listRssFeeds,
  pollRssFeedNow,
  removeRssFeed,
  updateRssFeed,
  type RssFeedRow,
} from '~/server/rss'
import { listAccounts, type AccountSummary } from '~/server/accounts'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/rss')({
  loader: async ({ params }) => {
    const [feeds, accounts] = await Promise.all([
      listRssFeeds({ data: { workspaceSlug: params.workspaceSlug } }),
      listAccounts({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    return { feeds, accounts }
  },
  component: RssSettings,
})

function RssSettings() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData() as { feeds: RssFeedRow[]; accounts: AccountSummary[] }
  const [feeds, setFeeds] = useState<RssFeedRow[]>(initial.feeds)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    const next = await listRssFeeds({ data: { workspaceSlug } })
    setFeeds(next)
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setBusy('add')
    setError(null)
    try {
      await addRssFeed({ data: { workspaceSlug, url: url.trim() } })
      setUrl('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add feed')
    } finally {
      setBusy(null)
    }
  }

  const toggle = async (id: string, patch: Partial<RssFeedRow>) => {
    setBusy(id)
    try {
      await updateRssFeed({ data: { workspaceSlug, id, ...patch } })
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this feed? Already-created posts stay.')) return
    setBusy(id)
    try {
      await removeRssFeed({ data: { workspaceSlug, id } })
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const syncNow = async (id: string) => {
    setBusy(id)
    try {
      await pollRssFeedNow({ data: { workspaceSlug, id } })
    } finally {
      setBusy(null)
    }
  }

  const connectedAccounts = initial.accounts.filter((a) => a.status === 'connected')

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="rss" />
      <Card>
        <form className="space-y-3 p-4" onSubmit={add}>
          <Field label={t('rss.feedUrl')} htmlFor="rss-url">
            <Input
              id="rss-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
            />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div>
            <Button type="submit" disabled={busy === 'add' || !url.trim()}>
              {busy === 'add' ? <Spinner /> : null} {t('rss.addFeed')}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        {feeds.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
            {t('rss.noFeeds')}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {feeds.map((f) => (
              <li key={f.id} className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                      {f.title ?? f.url}
                    </div>
                    <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {f.url} ·{' '}
                      {f.lastPolledAt
                        ? `${t('rss.lastPolled')} ${new Date(f.lastPolledAt).toLocaleString()}`
                        : t('rss.neverPolled')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => syncNow(f.id)}
                      disabled={busy === f.id}
                      title={t('rss.pollNowTitle')}
                    >
                      <RefreshCw className="h-3 w-3" /> {t('rss.sync')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(f.id)}
                      disabled={busy === f.id}
                      title={t('rss.removeTitle')}
                    >
                      <Trash2 className="h-3 w-3 text-red-600" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={f.active}
                      onChange={(e) => toggle(f.id, { active: e.target.checked })}
                    />
                    {t('rss.active')}
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={f.autoPublish}
                      onChange={(e) => toggle(f.id, { autoPublish: e.target.checked })}
                    />
                    {t('rss.autoPublish')}
                  </label>
                  {f.autoPublish ? (
                    <AccountPicker
                      accounts={connectedAccounts}
                      selected={f.defaultAccountIds}
                      onChange={(ids) => toggle(f.id, { defaultAccountIds: ids })}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function AccountPicker({
  accounts,
  selected,
  onChange,
}: {
  accounts: AccountSummary[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const t = useT()
  return (
    <div className="flex flex-wrap items-center gap-1">
      {accounts.length === 0 ? (
        <span className="text-neutral-500 dark:text-neutral-400">{t('rss.noConnectedAccounts')}</span>
      ) : (
        accounts.map((a) => {
          const on = selected.includes(a.id)
          return (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                onChange(on ? selected.filter((id) => id !== a.id) : [...selected, a.id])
              }
              className={`rounded-full border px-2 py-0.5 ${
                on
                  ? 'border-indigo-500 bg-indigo-500 text-white'
                  : 'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200'
              }`}
            >
              {a.platform}:{a.accountHandle}
            </button>
          )
        })
      )}
    </div>
  )
}
