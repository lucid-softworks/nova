import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Card } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { LogoUploader } from '~/components/settings/LogoUploader'
import { SettingsNav } from '~/components/settings/SettingsNav'
import {
  getWorkspaceSettings,
  updateWorkspaceGeneral,
  deleteWorkspace,
  type WorkspaceSettings,
} from '~/server/settings'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/')({
  loader: async ({ params }) => ({
    settings: await getWorkspaceSettings({ data: { workspaceSlug: params.workspaceSlug } }),
  }),
  component: GeneralSettings,
})

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'pt', label: 'Portuguese' },
]

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
]

function GeneralSettings() {
  const { workspaceSlug } = Route.useParams()
  const { workspace } = Route.useRouteContext()
  const initial = Route.useLoaderData()
  const navigate = useNavigate()
  const [settings, setSettings] = useState<WorkspaceSettings>(initial.settings)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const canEdit = workspace.role === 'admin'

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await updateWorkspaceGeneral({
        data: {
          workspaceSlug,
          name: settings.name,
          slug: settings.slug,
          timezone: settings.timezone,
          defaultLanguage: settings.defaultLanguage,
          logoUrl: settings.logoUrl ?? '',
        },
      })
      setMessage('Saved')
      if (res.newSlug !== workspaceSlug) {
        navigate({
          to: '/$workspaceSlug/settings',
          params: { workspaceSlug: res.newSlug },
        })
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    try {
      await deleteWorkspace({ data: { workspaceSlug, confirmName: deleteConfirm } })
      navigate({ to: '/onboarding' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="general" />
      <Card>
        <div className="space-y-4 p-4">
          <h3 className="text-sm font-semibold text-neutral-900">General</h3>
          <Field label="Workspace name" htmlFor="name">
            <Input
              id="name"
              value={settings.name}
              disabled={!canEdit}
              onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
            />
          </Field>
          <Field label="URL slug" htmlFor="slug" hint="Lowercase letters, numbers, hyphens">
            <Input
              id="slug"
              value={settings.slug}
              disabled={!canEdit}
              onChange={(e) => setSettings((s) => ({ ...s, slug: e.target.value }))}
            />
          </Field>
          <Field label="Logo" htmlFor="logo" hint="Square image works best">
            <LogoUploader
              workspaceSlug={workspaceSlug}
              value={settings.logoUrl ?? ''}
              onChange={(url) => setSettings((s) => ({ ...s, logoUrl: url }))}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Timezone" htmlFor="tz">
            <select
              id="tz"
              value={settings.timezone}
              disabled={!canEdit}
              onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))}
              className="h-10 w-full rounded-md border border-neutral-200 bg-white px-2 text-sm"
            >
              {COMMON_TIMEZONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default language" htmlFor="lang">
            <select
              id="lang"
              value={settings.defaultLanguage}
              disabled={!canEdit}
              onChange={(e) => setSettings((s) => ({ ...s, defaultLanguage: e.target.value }))}
              className="h-10 w-full rounded-md border border-neutral-200 bg-white px-2 text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          {message ? <p className="text-sm text-neutral-600">{message}</p> : null}
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || !canEdit}>
              {saving ? <Spinner /> : null} Save
            </Button>
          </div>
        </div>
      </Card>

      {canEdit ? (
        <Card>
          <div className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-red-700">Danger zone</h3>
            <p className="text-xs text-neutral-500">
              Deleting the workspace removes all posts, media, campaigns, and connected accounts.
              This cannot be undone.
            </p>
            <Button variant="outline" className="text-red-600" onClick={() => setDeleteOpen(true)}>
              Delete Workspace
            </Button>
          </div>
        </Card>
      ) : null}

      {deleteOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteOpen(false)} />
          <div className="absolute left-1/2 top-1/2 w-[min(460px,95%)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-red-700">Delete &quot;{settings.name}&quot;?</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Type the workspace name below to confirm. This cannot be undone.
            </p>
            <Input
              className="mt-3"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={settings.name}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="outline"
                className="text-red-600"
                disabled={deleteConfirm !== settings.name}
                onClick={onDelete}
              >
                Delete forever
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
