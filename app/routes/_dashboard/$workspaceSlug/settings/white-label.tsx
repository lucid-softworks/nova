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
import { getCustomDomain, setCustomDomain, verifyCustomDomain } from '~/server/customDomain'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/white-label')({
  loader: async ({ params }) => ({
    settings: await getWorkspaceSettings({ data: { workspaceSlug: params.workspaceSlug } }),
    customDomain: await getCustomDomain({ data: { workspaceSlug: params.workspaceSlug } }),
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

  // Custom domain state
  const [domain, setDomain] = useState(initial.customDomain.domain ?? '')
  const [verified, setVerified] = useState(initial.customDomain.verified)
  const [domainSaving, setDomainSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [domainMessage, setDomainMessage] = useState<string | null>(null)

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

  const saveDomain = async () => {
    setDomainSaving(true)
    setDomainMessage(null)
    try {
      await setCustomDomain({ data: { workspaceSlug, domain } })
      setVerified(false)
      setDomainMessage(t('settings.saved'))
    } catch (e) {
      setDomainMessage(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setDomainSaving(false)
    }
  }

  const verify = async () => {
    setVerifying(true)
    setDomainMessage(null)
    try {
      const res = await verifyCustomDomain({ data: { workspaceSlug } })
      setVerified(res.verified)
      setDomainMessage(res.verified ? t('whiteLabel.verified') : t('whiteLabel.notVerified'))
    } catch (e) {
      setDomainMessage(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  const effectiveAppName = appName.trim() || 'Nova'

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

      {/* Custom domain card */}
      <Card>
        <div className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t('whiteLabel.customDomain')}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('whiteLabel.domainHint')}</p>
          <Field label={t('whiteLabel.customDomain')} htmlFor="custom-domain">
            <Input
              id="custom-domain"
              value={domain}
              disabled={!canEdit}
              placeholder="app.example.com"
              onChange={(e) => setDomain(e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Button onClick={saveDomain} disabled={domainSaving || !canEdit || !domain.trim()}>
              {domainSaving ? <Spinner /> : null} {t('whiteLabel.saveDomain')}
            </Button>
          </div>
          {domain.trim() && (
            <div className="space-y-2 rounded-md bg-neutral-50 p-3 dark:bg-neutral-800">
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                {t('whiteLabel.addTxtRecord').replace('{workspaceId}', initial.settings.id)}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={verify} disabled={verifying || !canEdit}>
                  {verifying ? <Spinner /> : null} {t('whiteLabel.verify')}
                </Button>
                {verified ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {t('whiteLabel.verified')}
                  </span>
                ) : null}
              </div>
            </div>
          )}
          {domainMessage ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{domainMessage}</p>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
