import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { PLATFORM_LIST } from '~/lib/platforms'
import {
  getAdminPlatformSettings,
  updateAdminPlatformSettings,
  type PlatformSettings,
} from '~/server/admin'

const FEATURE_FLAGS = [
  { key: 'aiAssist', label: 'AI assist (hashtags, generate)' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'bioPages', label: 'Bio pages' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'scheduling', label: 'Scheduling' },
] as const

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
  const [allowlistInput, setAllowlistInput] = useState(initial.settings.signupEmailAllowlist.join(', '))
  const [blocklistInput, setBlocklistInput] = useState(initial.settings.signupEmailBlocklist.join(', '))
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
      const parseDomains = (s: string) =>
        s
          .split(/[\s,]+/)
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean)
      const next = await updateAdminPlatformSettings({
        data: {
          signupsEnabled: settings.signupsEnabled,
          signupRateLimitMax: max,
          signupRateLimitWindowHours: settings.signupRateLimitWindowHours,
          signupEmailAllowlist: parseDomains(allowlistInput),
          signupEmailBlocklist: parseDomains(blocklistInput),
          disabledPlatforms: settings.disabledPlatforms,
          maintenanceMode: settings.maintenanceMode,
          announcementBanner: settings.announcementBanner,
          featureFlags: settings.featureFlags,
        },
      })
      setSettings(next)
      setAllowlistInput(next.signupEmailAllowlist.join(', '))
      setBlocklistInput(next.signupEmailBlocklist.join(', '))
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const togglePlatform = (key: string) => {
    setSettings((s) => {
      const next = new Set(s.disabledPlatforms)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...s, disabledPlatforms: [...next] }
    })
  }

  const toggleFlag = (key: string, checked: boolean) => {
    setSettings((s) => ({
      ...s,
      featureFlags: { ...s.featureFlags, [key]: checked },
    }))
  }

  return (
    <div className="space-y-4 pb-20">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Platform settings
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Applies to every workspace on this instance.
        </p>
      </div>

      <Card>
        <div className="p-4">
          <SectionHeader
            title="Maintenance"
            description="Banner + write-blocking. Admins bypass the block so they can still fix things."
          />
          <div className="space-y-4">
            <Toggle
              label="Maintenance mode"
              checked={settings.maintenanceMode}
              onChange={(v) => setSettings((s) => ({ ...s, maintenanceMode: v }))}
            />
            <Field label="Announcement banner" htmlFor="banner">
              <Input
                id="banner"
                value={settings.announcementBanner ?? ''}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    announcementBanner: e.target.value.trim() === '' ? null : e.target.value,
                  }))
                }
                placeholder="E.g. Scheduled downtime Sunday 2am UTC"
                maxLength={500}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-5 p-4">
          <SectionHeader
            title="Sign-ups"
            description="Control who can create new accounts."
          />
          <Toggle
            label="Sign-ups enabled"
            checked={settings.signupsEnabled}
            onChange={(v) => setSettings((s) => ({ ...s, signupsEnabled: v }))}
          />

          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Field label="Max sign-ups per window" htmlFor="max">
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

          <Field
            label="Email domain allowlist"
            htmlFor="allowlist"
            hint="Comma or whitespace-separated. When non-empty, only these domains may sign up."
          >
            <Input
              id="allowlist"
              value={allowlistInput}
              onChange={(e) => setAllowlistInput(e.target.value)}
              placeholder="example.com, acme.org"
            />
          </Field>
          <Field
            label="Email domain blocklist"
            htmlFor="blocklist"
            hint="Domains that are always rejected, even if on the allowlist."
          >
            <Input
              id="blocklist"
              value={blocklistInput}
              onChange={(e) => setBlocklistInput(e.target.value)}
              placeholder="spam.xyz"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <SectionHeader
            title="OAuth platforms"
            description="Hide specific social platforms from the connect-account UI even when credentials are configured."
          />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {PLATFORM_LIST.map((p) => (
              <Toggle
                key={p.key}
                label={p.label}
                checked={!settings.disabledPlatforms.includes(p.key)}
                onChange={() => togglePlatform(p.key)}
              />
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <SectionHeader
            title="Feature flags"
            description="Kill switches for major features. Off blocks the relevant server fn at the edge."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {FEATURE_FLAGS.map((f) => {
              const current = settings.featureFlags[f.key]
              const enabled = current !== false
              return (
                <Toggle
                  key={f.key}
                  label={f.label}
                  checked={enabled}
                  onChange={(v) => toggleFlag(f.key, v)}
                />
              )
            })}
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 flex items-center gap-3 bg-neutral-50/80 dark:bg-neutral-950/80 py-3 backdrop-blur">
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner /> : null} Save all
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {savedAt && !error ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Saved</p>
        ) : null}
      </div>
    </div>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span className="text-sm text-neutral-700 dark:text-neutral-200">{label}</span>
    </label>
  )
}
