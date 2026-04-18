import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { SettingsNav } from '~/components/settings/SettingsNav'
import { getBioPage, upsertBioPage, type BioPageRow } from '~/server/bioPage'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/bio')({
  loader: async ({ params }) => ({
    bioPage: await getBioPage({ data: { workspaceSlug: params.workspaceSlug } }),
  }),
  component: BioSettingsPage,
})

function BioSettingsPage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData() as { bioPage: BioPageRow | null }

  const [handle, setHandle] = useState(initial.bioPage?.handle ?? workspaceSlug)
  const [displayName, setDisplayName] = useState(initial.bioPage?.displayName ?? '')
  const [avatarUrl, setAvatarUrl] = useState(initial.bioPage?.avatarUrl ?? '')
  const [bio, setBio] = useState(initial.bioPage?.bio ?? '')
  const [theme, setTheme] = useState<'default' | 'dark' | 'minimal'>(
    (initial.bioPage?.theme as 'default' | 'dark' | 'minimal') ?? 'default',
  )
  const [links, setLinks] = useState<Array<{ title: string; url: string }>>(
    initial.bioPage?.links ?? [],
  )
  const [showRecentPosts, setShowRecentPosts] = useState(
    initial.bioPage?.showRecentPosts ?? true,
  )
  const [recentPostCount, setRecentPostCount] = useState(
    initial.bioPage?.recentPostCount ?? 6,
  )
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await upsertBioPage({
        data: {
          workspaceSlug,
          handle,
          displayName: displayName || null,
          avatarUrl: avatarUrl || null,
          bio: bio || null,
          theme,
          links: links.filter((l) => l.title.trim() && l.url.trim()),
          showRecentPosts,
          recentPostCount,
        },
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const addLink = () => setLinks([...links, { title: '', url: '' }])
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i))
  const updateLink = (i: number, field: 'title' | 'url', value: string) => {
    const next = [...links]
    next[i] = { ...next[i]!, [field]: value }
    setLinks(next)
  }

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="bio" />
      <Card>
        <form className="space-y-5 p-4" onSubmit={save}>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t('bio.title')}
          </h3>

          {/* Handle */}
          <Field label={t('bio.handle')} htmlFor="bio-handle">
            <Input
              id="bio-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="my-brand"
            />
          </Field>

          {/* Display name */}
          <Field label={t('bio.displayName')} htmlFor="bio-name">
            <Input
              id="bio-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Brand"
            />
          </Field>

          {/* Avatar URL */}
          <Field label={t('bio.avatarUrl')} htmlFor="bio-avatar">
            <Input
              id="bio-avatar"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </Field>

          {/* Bio textarea */}
          <Field label={t('bio.bioText')} htmlFor="bio-text">
            <textarea
              id="bio-text"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              placeholder="A short description about you or your brand..."
            />
          </Field>

          {/* Theme picker */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t('bio.theme')}
            </legend>
            <div className="flex gap-4">
              {(['default', 'dark', 'minimal'] as const).map((v) => (
                <label key={v} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="theme"
                    value={v}
                    checked={theme === v}
                    onChange={() => setTheme(v)}
                    className="accent-indigo-600"
                  />
                  {t(`bio.theme${v.charAt(0).toUpperCase()}${v.slice(1)}` as 'bio.themeDefault')}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Links editor */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t('bio.links')}
            </label>
            {links.map((link, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  value={link.title}
                  onChange={(e) => updateLink(i, 'title', e.target.value)}
                  placeholder={t('bio.linkTitle')}
                  className="min-w-[160px] flex-1"
                />
                <Input
                  value={link.url}
                  onChange={(e) => updateLink(i, 'url', e.target.value)}
                  placeholder={t('bio.linkUrl')}
                  className="flex-1"
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => removeLink(i)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLink}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('bio.addLink')}
            </Button>
          </div>

          {/* Show recent posts toggle */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showRecentPosts}
                onChange={(e) => setShowRecentPosts(e.target.checked)}
                className="accent-indigo-600"
              />
              {t('bio.showRecentPosts')}
            </label>
            {showRecentPosts ? (
              <Input
                type="number"
                min={1}
                max={50}
                value={recentPostCount}
                onChange={(e) => setRecentPostCount(Number(e.target.value))}
                className="w-20"
              />
            ) : null}
          </div>

          {/* Preview link */}
          {handle ? (
            <a
              href={`/bio/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('bio.preview')}
            </a>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {saved ? (
            <p className="text-sm text-green-600">{t('settings.saved')}</p>
          ) : null}

          <Button type="submit" disabled={busy || !handle.trim()}>
            {busy ? <Spinner /> : null} {t('bio.save')}
          </Button>
        </form>
      </Card>
    </div>
  )
}
