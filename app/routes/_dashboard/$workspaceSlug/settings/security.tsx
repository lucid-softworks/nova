import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Copy, KeyRound, Shield, ShieldCheck, Smartphone, Trash2, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { SettingsNav } from '~/components/settings/SettingsNav'
import { authClient } from '~/lib/auth-client'
import { useT } from '~/lib/i18n'

type Passkey = { id: string; name?: string | null; createdAt: string | Date }
type SessionRow = { id: string; ipAddress?: string | null; userAgent?: string | null; createdAt: string | Date; current?: boolean }

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/security')({
  component: SecurityPage,
})

function SecurityPage() {
  const { workspaceSlug } = Route.useParams()
  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="security" />
      <TwoFactorCard />
      <PasskeyCard />
      <SessionsCard />
    </div>
  )
}

// -- 2FA -------------------------------------------------------------------

function TwoFactorCard() {
  const t = useT()
  const { data: session } = authClient.useSession()
  const enabled = (session?.user as unknown as { twoFactorEnabled?: boolean } | undefined)
    ?.twoFactorEnabled
  const [password, setPassword] = useState('')
  const [qr, setQr] = useState<{ totpURI: string; backupCodes: string[] } | null>(null)
  const [totp, setTotp] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const enroll = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await authClient.twoFactor.enable({ password })
      const d = res.data as { totpURI?: string; backupCodes?: string[] } | null
      if (d?.totpURI) setQr({ totpURI: d.totpURI, backupCodes: d.backupCodes ?? [] })
      else setMessage(res.error?.message ?? 'Could not enable 2FA')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await authClient.twoFactor.verifyTotp({ code: totp })
      if (res.error) setMessage(res.error.message ?? 'Invalid code')
      else {
        setMessage('2FA is now active')
        setQr(null)
        setTotp('')
      }
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (!confirm('Disable two-factor auth?')) return
    setBusy(true)
    try {
      await authClient.twoFactor.disable({ password })
      setMessage('2FA disabled')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="h-4 w-4 text-green-600" />
          ) : (
            <Shield className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          )}
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('security.twoFactor')}</h3>
        </div>
        {enabled ? (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('security.twoFactorActive')}</p>
            <Field label={t('security.confirmPassword')} htmlFor="tfa-pw">
              <Input
                id="tfa-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button variant="outline" className="text-red-600" onClick={disable} disabled={busy || !password}>
              {busy ? <Spinner /> : null} {t('security.disable2FA')}
            </Button>
          </>
        ) : qr ? (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {t('security.addTotpDescription')}
            </p>
            <code className="block break-all rounded bg-neutral-50 dark:bg-neutral-900 p-2 text-[11px]">{qr.totpURI}</code>
            {qr.backupCodes.length > 0 ? (
              <div>
                <div className="mb-1 text-xs font-semibold">{t('security.backupCodes')}</div>
                <div className="grid grid-cols-2 gap-1 font-mono text-xs">
                  {qr.backupCodes.map((c) => (
                    <div key={c}>{c}</div>
                  ))}
                </div>
              </div>
            ) : null}
            <Field label={t('security.enterCode')} htmlFor="tfa-code">
              <Input id="tfa-code" value={totp} onChange={(e) => setTotp(e.target.value)} />
            </Field>
            <Button onClick={verify} disabled={busy || totp.length < 6}>
              {busy ? <Spinner /> : null} {t('security.verify')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Add a time-based code from your authenticator app as a second factor.
            </p>
            <Field label={t('security.confirmPassword')} htmlFor="tfa-pw-enable">
              <Input
                id="tfa-pw-enable"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button onClick={enroll} disabled={busy || !password}>
              {busy ? <Spinner /> : null} {t('security.enable2FA')}
            </Button>
          </>
        )}
        {message ? <p className="text-sm text-neutral-600 dark:text-neutral-300">{message}</p> : null}
      </div>
    </Card>
  )
}

// -- Passkeys --------------------------------------------------------------

function PasskeyCard() {
  const t = useT()
  const [keys, setKeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const reload = async () => {
    setLoading(true)
    try {
      const res = await authClient.passkey.listUserPasskeys()
      setKeys(((res.data as Passkey[] | null) ?? []) as Passkey[])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void reload()
  }, [])

  const addPasskey = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await authClient.passkey.addPasskey()
      if (res?.error) setMessage(res.error.message ?? 'Could not add passkey')
      await reload()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Passkey registration cancelled')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this passkey?')) return
    await authClient.passkey.deletePasskey({ id })
    await reload()
  }

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('security.passkeys')}</h3>
        </div>
        {loading ? (
          <Spinner />
        ) : keys.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('security.noPasskeys')}</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-md border border-neutral-200 dark:border-neutral-800 p-2 text-sm"
              >
                <div>
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">{k.name ?? t('security.unnamedPasskey')}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Added {new Date(k.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(k.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button onClick={addPasskey} disabled={busy}>
          {busy ? <Spinner /> : null} {t('security.addPasskey')}
        </Button>
        {message ? <p className="text-xs text-neutral-500 dark:text-neutral-400">{message}</p> : null}
      </div>
    </Card>
  )
}

// -- Sessions --------------------------------------------------------------

function SessionsCard() {
  const t = useT()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try {
      const res = await authClient.multiSession.listDeviceSessions()
      const data = res.data as unknown as { session: SessionRow; user: unknown }[] | null
      setSessions((data ?? []).map((d) => d.session))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const revoke = async (sessionId: string) => {
    await authClient.revokeSession({ token: sessionId })
    await reload()
  }
  const revokeAll = async () => {
    if (!confirm('Log out everywhere (including this device)?')) return
    await authClient.revokeSessions()
    window.location.href = '/login'
  }

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('security.activeSessions')}</h3>
          </div>
          <Button variant="outline" size="sm" className="text-red-600" onClick={revokeAll}>
            {t('security.logOutEverywhere')}
          </Button>
        </div>
        {loading ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Just this one.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-neutral-200 dark:border-neutral-800 p-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate text-xs text-neutral-600 dark:text-neutral-300">
                    {s.userAgent ?? t('security.unknownDevice')}
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {s.ipAddress ?? '—'} · {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => revoke(s.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

// Silence unused import warning
void Copy
