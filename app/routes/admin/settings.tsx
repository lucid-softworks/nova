import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import {
  getAdminPlatformSettings,
  updateAdminPlatformSettings,
  type PlatformSettings,
} from '~/server/admin'

export const Route = createFileRoute('/admin/settings')({
  loader: async () => ({ settings: await getAdminPlatformSettings() }),
  component: SettingsPage,
})

function SettingsPage() {
  const initial = Route.useLoaderData()
  const [settings, setSettings] = useState<PlatformSettings>(initial.settings)
  const [maxInput, setMaxInput] = useState<string>(
    initial.settings.signupRateLimitMax?.toString() ?? '',
  )
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    setSaving(true)
    try {
      const trimmed = maxInput.trim()
      const max = trimmed === '' ? null : Number(trimmed)
      if (max !== null && (!Number.isInteger(max) || max < 1)) {
        throw new Error('Rate limit must be a positive integer or blank.')
      }
      const next = await updateAdminPlatformSettings({
        data: {
          signupsEnabled: settings.signupsEnabled,
          signupRateLimitMax: max,
          signupRateLimitWindowHours: settings.signupRateLimitWindowHours,
        },
      })
      setSettings(next)
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Platform settings
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Applies to every workspace on this instance.
        </p>
      </div>

      <Card>
        <div className="space-y-5 p-4">
          <section className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Sign-ups enabled
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  When off, the /register flow rejects new accounts.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.signupsEnabled}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, signupsEnabled: e.target.checked }))
                  }
                  className="h-4 w-4"
                />
                <span className="text-sm text-neutral-700 dark:text-neutral-200">
                  {settings.signupsEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-neutral-200 dark:border-neutral-800 pt-5">
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Sign-up rate limit
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Caps how many new accounts can be created per rolling window. Leave blank
                for unlimited.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Field label="Max sign-ups" htmlFor="max">
                <Input
                  id="max"
                  type="number"
                  min={1}
                  max={10000}
                  value={maxInput}
                  onChange={(e) => setMaxInput(e.target.value)}
                  placeholder="Unlimited"
                />
              </Field>
              <Field label="Window (hours)" htmlFor="window">
                <Input
                  id="window"
                  type="number"
                  min={1}
                  max={720}
                  value={settings.signupRateLimitWindowHours}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      signupRateLimitWindowHours: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              </Field>
            </div>
          </section>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner /> : null} Save
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {savedAt && !error ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Saved</p>
        ) : null}
      </div>
    </div>
  )
}
