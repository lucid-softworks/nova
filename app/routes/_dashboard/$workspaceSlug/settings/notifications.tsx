import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
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

const TYPES: Array<{
  key:
    | 'post_published'
    | 'post_failed'
    | 'approval_requested'
    | 'post_approved'
    | 'post_rejected'
    | 'member_joined'
    | 'campaign_on_hold'
  label: string
}> = [
  { key: 'post_published', label: 'Post published' },
  { key: 'post_failed', label: 'Post failed' },
  { key: 'approval_requested', label: 'Approval requested' },
  { key: 'post_approved', label: 'Post approved' },
  { key: 'post_rejected', label: 'Changes requested' },
  { key: 'member_joined', label: 'Member joined workspace' },
  { key: 'campaign_on_hold', label: 'Campaign on hold' },
]

const DEFAULTS: Record<
  (typeof TYPES)[number]['key'],
  { inApp: boolean; email: boolean; push: boolean }
> = {
  post_published: { inApp: true, email: false, push: false },
  post_failed: { inApp: true, email: true, push: true },
  approval_requested: { inApp: true, email: true, push: true },
  post_approved: { inApp: true, email: true, push: false },
  post_rejected: { inApp: true, email: true, push: false },
  member_joined: { inApp: true, email: false, push: false },
  campaign_on_hold: { inApp: true, email: true, push: true },
}

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/notifications')({
  loader: async () => ({ settings: await getMySettings() }),
  component: NotificationsSettings,
})

function NotificationsSettings() {
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

      <Card>
        <div className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">brrr.now push</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Paste the webhook secret from your brrr.now app to receive push notifications on
            your iPhone/iPad. Secret is encrypted at rest.
          </p>
          {settings.brrrConnected ? (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <Check className="h-4 w-4" /> Connected
            </div>
          ) : null}
          <Field label="brrr.now secret" htmlFor="brrr">
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
              {savingBrrr ? <Spinner /> : null} Save
            </Button>
            {settings.brrrConnected ? (
              <>
                <Button variant="outline" onClick={onTestPush} disabled={testing}>
                  {testing ? <Spinner /> : <Send className="h-3 w-3" />} Test push
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-600"
                  onClick={async () => {
                    await saveBrrrSecret({ data: { secret: null } })
                    setSettings((s) => ({ ...s, brrrConnected: false }))
                  }}
                >
                  Disconnect
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Event preferences</h3>
          <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-center">In-app</th>
                  <th className="px-3 py-2 text-center">Email</th>
                  <th className="px-3 py-2 text-center">Push</th>
                </tr>
              </thead>
              <tbody>
                {TYPES.map((t) => {
                  const p = getPrefs(t.key)
                  return (
                    <tr key={t.key} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                      <td className="px-3 py-2">{t.label}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={p.inApp}
                          onChange={() => toggle(t.key, 'inApp')}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={p.email}
                          onChange={() => toggle(t.key, 'email')}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={p.push}
                          onChange={() => toggle(t.key, 'push')}
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
