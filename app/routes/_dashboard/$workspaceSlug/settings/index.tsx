import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from '~/components/ui/toast'
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
import { useT } from '~/lib/i18n'

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
  const t = useT()
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
      setMessage(t('settings.saved'))
      if (res.newSlug !== workspaceSlug) {
        navigate({
          to: '/$workspaceSlug/settings',
          params: { workspaceSlug: res.newSlug },
        })
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('settings.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    try {
      await deleteWorkspace({ data: { workspaceSlug, confirmName: deleteConfirm } })
      navigate({ to: '/onboarding' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.deleteFailed'))
    }
  }

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="general" />
      <Card>
        <div className="space-y-4 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('settings.general')}</h3>
          <Field label={t('settings.workspaceName')} htmlFor="name">
            <Input
              id="name"
              value={settings.name}
              disabled={!canEdit}
              onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
            />
          </Field>
          <Field label={t('settings.urlSlug')} htmlFor="slug" hint={t('onboarding.urlSlugHint')}>
            <Input
              id="slug"
              value={settings.slug}
              disabled={!canEdit}
              onChange={(e) => setSettings((s) => ({ ...s, slug: e.target.value }))}
            />
          </Field>
          <Field label={t('settings.logo')} htmlFor="logo" hint={t('settings.logoHint')}>
            <LogoUploader
              workspaceSlug={workspaceSlug}
              value={settings.logoUrl ?? ''}
              onChange={(url) => setSettings((s) => ({ ...s, logoUrl: url }))}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('settings.timezone')} htmlFor="tz">
            <select
              id="tz"
              value={settings.timezone}
              disabled={!canEdit}
              onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))}
              className="h-10 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 text-sm"
            >
              {COMMON_TIMEZONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('settings.defaultLanguage')} htmlFor="lang">
            <select
              id="lang"
              value={settings.defaultLanguage}
              disabled={!canEdit}
              onChange={(e) => setSettings((s) => ({ ...s, defaultLanguage: e.target.value }))}
              className="h-10 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          {message ? <p className="text-sm text-neutral-600 dark:text-neutral-300">{message}</p> : null}
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || !canEdit}>
              {saving ? <Spinner /> : null} {t('settings.save')}
            </Button>
          </div>
        </div>
      </Card>

      {canEdit ? (
        <Card>
          <div className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">{t('settings.dangerZone')}</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('settings.deleteWarning')}
            </p>
            <Button variant="outline" className="text-red-600" onClick={() => setDeleteOpen(true)}>
              {t('settings.deleteWorkspace')}
            </Button>
          </div>
        </Card>
      ) : null}

      {deleteOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteOpen(false)} />
          <div className="absolute left-1/2 top-1/2 w-[min(460px,95%)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">Delete &quot;{settings.name}&quot;?</h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {t('settings.typeNameToConfirm')}
            </p>
            <Input
              className="mt-3"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={settings.name}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                {t('settings.cancel')}
              </Button>
              <Button
                variant="outline"
                className="text-red-600"
                disabled={deleteConfirm !== settings.name}
                onClick={onDelete}
              >
                {t('settings.deleteForever')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
