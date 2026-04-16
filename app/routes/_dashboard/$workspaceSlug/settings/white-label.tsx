import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Card } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { LogoUploader } from '~/components/settings/LogoUploader'
import { SettingsNav } from '~/components/settings/SettingsNav'
import { getWorkspaceSettings, updateWorkspaceGeneral } from '~/server/settings'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/white-label')({
  loader: async ({ params }) => ({
    settings: await getWorkspaceSettings({ data: { workspaceSlug: params.workspaceSlug } }),
  }),
  component: WhiteLabelPage,
})

function WhiteLabelPage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const { workspace } = Route.useRouteContext()
  const initial = Route.useLoaderData()
  const canEdit = workspace.role === 'admin'
  const [appName, setAppName] = useState(initial.settings.appName ?? '')
  const [logoUrl, setLogoUrl] = useState(initial.settings.logoUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updateWorkspaceGeneral({
        data: { workspaceSlug, appName, logoUrl },
      })
      setMessage(t('settings.saved'))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const effectiveAppName = appName.trim() || 'SocialHub'

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="white-label" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('whiteLabel.title')}</h3>
            <Field label={t('whiteLabel.appName')} htmlFor="app-name" hint={t('whiteLabel.appNameHint')}>
              <Input
                id="app-name"
                value={appName}
                disabled={!canEdit}
                onChange={(e) => setAppName(e.target.value)}
              />
            </Field>
            <Field label={t('settings.logo')} htmlFor="logo-url" hint={t('settings.logoHint')}>
              <LogoUploader
                workspaceSlug={workspaceSlug}
                value={logoUrl}
                onChange={setLogoUrl}
                disabled={!canEdit}
              />
            </Field>
            {message ? <p className="text-sm text-neutral-600 dark:text-neutral-300">{message}</p> : null}
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving || !canEdit}>
                {saving ? <Spinner /> : null} {t('whiteLabel.save')}
              </Button>
            </div>
          </div>
        </Card>
        <Card>
          <div className="space-y-2 p-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('whiteLabel.title')}</h3>
            <div className="overflow-hidden rounded-md">
              <div className="flex items-center gap-2 bg-[#0f1117] px-3 py-3 text-white">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-7 w-7 rounded" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-500 text-xs font-semibold">
                    {effectiveAppName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-sm font-semibold">{effectiveAppName}</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
