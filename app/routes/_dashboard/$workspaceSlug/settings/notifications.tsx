import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Check, Send } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { SettingsNav } from '~/components/settings/SettingsNav'
import {
  getMySettings,
  setPreference,
  saveBrrrSecret,
  testBrrrPush,
  type MeSettings,
} from '~/server/me'
import { getDigestOptIn, setDigestOptIn } from '~/server/digests'
import { useT } from '~/lib/i18n'

const TYPES = [
  { key: 'post_published', label: 'notifSettings.postPublished' },
  { key: 'post_failed', label: 'notifSettings.postFailed' },
  { key: 'approval_requested', label: 'notifSettings.approvalRequested' },
  { key: 'post_approved', label: 'notifSettings.postApproved' },
  { key: 'post_rejected', label: 'notifSettings.changesRequested' },
  { key: 'member_joined', label: 'notifSettings.memberJoined' },
  { key: 'campaign_on_hold', label: 'notifSettings.campaignOnHold' },
] as const

const DEFAULTS = {
  post_published: { inApp: true, email: false, push: false },
  post_failed: { inApp: true, email: true, push: true },
  approval_requested: { inApp: true, email: true, push: true },
  post_approved: { inApp: true, email: true, push: false },
  post_rejected: { inApp: true, email: true, push: false },
  member_joined: { inApp: true, email: false, push: false },
  campaign_on_hold: { inApp: true, email: true, push: true },
} as const

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/notifications')({
  loader: async () => ({ settings: await getMySettings() }),
  component: NotificationsSettings,
})

function NotificationsSettings() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const [settings, setSettings] = useState<MeSettings>(initial.settings)
  const [brrrSecret, setBrrrSecret] = useState('')
  const [savingBrrr, setSavingBrrr] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const getPrefs = (key: (typeof TYPES)[number]['key']) =>
    (settings.notificationPreferences[key] as { inApp: boolean; email: boolean; push: boolean } | undefined) ??
    DEFAULTS[key]

  const toggle = async (
    key: (typeof TYPES)[number]['key'],
    channel: 'inApp' | 'email' | 'push',
  ) => {
    const curr = getPrefs(key)
    const next = { ...curr, [channel]: !curr[channel] }
    setSettings((s) => ({
      ...s,
      notificationPreferences: { ...s.notificationPreferences, [key]: next },
    }))
    try {
      await setPreference({ data: { type: key, prefs: next } })
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  const onSaveBrrr = async () => {
    setSavingBrrr(true)
    setToast(null)
    try {
      await saveBrrrSecret({ data: { secret: brrrSecret || null } })
      setSettings((s) => ({ ...s, brrrConnected: !!brrrSecret }))
      setBrrrSecret('')
      setToast(brrrSecret ? 'Saved — push now enabled' : 'Disconnected')
    } finally {
      setSavingBrrr(false)
    }
  }

  const onTestPush = async () => {
    setTesting(true)
    setToast(null)
    try {
      await testBrrrPush()
      setToast('Test push sent — check your device.')
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Push failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="notifications" />
      <DigestCard />

      <Card>
        <div className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('notifSettings.brrrPush')}</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {t('notifSettings.brrrDescription')}
          </p>
          {settings.brrrConnected ? (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <Check className="h-4 w-4" /> {t('notifSettings.brrrConnected')}
            </div>
          ) : null}
          <Field label={t('notifSettings.brrrSecret')} htmlFor="brrr">
            <Input
              id="brrr"
              value={brrrSecret}
              onChange={(e) => setBrrrSecret(e.target.value)}
              placeholder={settings.brrrConnected ? '••••••••••' : 'paste secret'}
              type="password"
            />
          </Field>
          <div className="flex gap-2">
            <Button onClick={onSaveBrrr} disabled={savingBrrr}>
              {savingBrrr ? <Spinner /> : null} {t('common.save')}
            </Button>
            {settings.brrrConnected ? (
              <>
                <Button variant="outline" onClick={onTestPush} disabled={testing}>
                  {testing ? <Spinner /> : <Send className="h-3 w-3" />} {t('notifSettings.testPush')}
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-600"
                  onClick={async () => {
                    await saveBrrrSecret({ data: { secret: null } })
                    setSettings((s) => ({ ...s, brrrConnected: false }))
                  }}
                >
                  {t('notifSettings.disconnect')}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('notifSettings.eventPreferences')}</h3>
          <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="px-3 py-2 text-left">{t('notifSettings.eventPreferences')}</th>
                  <th className="px-3 py-2 text-center">{t('notifSettings.inApp')}</th>
                  <th className="px-3 py-2 text-center">{t('notifSettings.email')}</th>
                  <th className="px-3 py-2 text-center">{t('notifSettings.push')}</th>
                </tr>
              </thead>
              <tbody>
                {TYPES.map((tp) => {
                  const p = getPrefs(tp.key)
                  return (
                    <tr key={tp.key} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                      <td className="px-3 py-2">{t(tp.label)}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={p.inApp}
                          onChange={() => toggle(tp.key, 'inApp')}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={p.email}
                          onChange={() => toggle(tp.key, 'email')}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={p.push}
                          onChange={() => toggle(tp.key, 'push')}
                          disabled={!settings.brrrConnected}
                          title={settings.brrrConnected ? '' : 'Connect brrr.now to enable push'}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {toast ? (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm text-neutral-700 dark:text-neutral-200 shadow-sm">
          {toast}
        </div>
      ) : null}
    </div>
  )
}


function DigestCard() {
  const t = useT()
  const [optIn, setOptIn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getDigestOptIn().then((r) => setOptIn(r.optIn))
  }, [])
  const toggle = async (v: boolean) => {
    setBusy(true)
    setOptIn(v)
    try {
      await setDigestOptIn({ data: { optIn: v } })
    } catch {
      setOptIn(!v)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <div className="space-y-2 p-4">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('notifSettings.weeklyDigest')}</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {t('notifSettings.digestDescription')}
        </p>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={optIn ?? false}
            disabled={optIn === null || busy}
            onChange={(e) => toggle(e.target.checked)}
          />
          {t('notifSettings.sendMeDigest')}
        </label>
      </div>
    </Card>
  )
}
