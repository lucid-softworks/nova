import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { PlatformIcon } from './PlatformIcon'
import { PLATFORM_LIST, type PlatformKey, connectionModeFor } from '~/lib/platforms'
import { connectBluesky, connectMastodon, startOAuth } from '~/server/accounts'

type Mode = { kind: 'grid' } | { kind: 'bluesky' } | { kind: 'mastodon' }

export function AddAccountDialog({
  workspaceSlug,
  connectedCounts,
  onConnected,
}: {
  workspaceSlug: string
  connectedCounts: Partial<Record<PlatformKey, number>>
  onConnected: () => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>({ kind: 'grid' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<PlatformKey | null>(null)

  const reset = () => {
    setMode({ kind: 'grid' })
    setError(null)
    setBusy(null)
  }

  const handlePlatform = async (platform: PlatformKey) => {
    setError(null)
    const m = connectionModeFor(platform)
    if (m === 'bluesky') return setMode({ kind: 'bluesky' })
    if (m === 'mastodon') return setMode({ kind: 'mastodon' })
    setBusy(platform)
    try {
      const { url } = await startOAuth({
        data: {
          workspaceSlug,
          platform: platform as Exclude<PlatformKey, 'bluesky' | 'mastodon'>,
        },
      })
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start connection')
      setBusy(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Add Account
        </Button>
      </DialogTrigger>
      <DialogContent>
        {mode.kind === 'grid' ? (
          <>
            <DialogHeader>
              <DialogTitle>Connect an account</DialogTitle>
              <DialogDescription>Choose a platform to link.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3">
              {PLATFORM_LIST.map((p) => {
                const count = connectedCounts[p.key] ?? 0
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => handlePlatform(p.key)}
                    disabled={busy !== null}
                    className="relative flex flex-col items-center gap-2 rounded-lg border border-neutral-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/50 disabled:opacity-60"
                  >
                    <PlatformIcon platform={p.key} size={40} />
                    <div className="text-xs font-medium text-neutral-700">{p.label}</div>
                    {count > 0 ? (
                      <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-semibold text-white">
                        +{count}
                      </span>
                    ) : null}
                    {busy === p.key ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                        <Spinner />
                      </div>
                    ) : null}
                  </button>
                )
              })}
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </>
        ) : mode.kind === 'bluesky' ? (
          <BlueskyForm
            workspaceSlug={workspaceSlug}
            onBack={() => setMode({ kind: 'grid' })}
            onSuccess={() => {
              setOpen(false)
              reset()
              onConnected()
            }}
          />
        ) : (
          <MastodonForm
            workspaceSlug={workspaceSlug}
            onBack={() => setMode({ kind: 'grid' })}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BlueskyForm({
  workspaceSlug,
  onBack,
  onSuccess,
}: {
  workspaceSlug: string
  onBack: () => void
  onSuccess: () => void
}) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await connectBluesky({ data: { workspaceSlug, identifier, password } })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect Bluesky')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <PlatformIcon platform="bluesky" size={36} />
          <div>
            <DialogTitle>Connect Bluesky</DialogTitle>
            <DialogDescription>Use an app password, not your account password.</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Handle or email" htmlFor="bsky-id">
          <Input
            id="bsky-id"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you.bsky.social"
            autoComplete="username"
          />
        </Field>
        <Field
          label="App password"
          htmlFor="bsky-pw"
          hint="Create one at bsky.app → Settings → App passwords"
        >
          <Input
            id="bsky-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" disabled={submitting || !identifier || !password}>
            {submitting ? <Spinner /> : null}
            Connect
          </Button>
        </div>
      </form>
    </>
  )
}

function MastodonForm({
  workspaceSlug,
  onBack,
}: {
  workspaceSlug: string
  onBack: () => void
}) {
  const [instance, setInstance] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { url } = await connectMastodon({ data: { workspaceSlug, instance } })
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Mastodon connection')
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <PlatformIcon platform="mastodon" size={36} />
          <div>
            <DialogTitle>Connect Mastodon</DialogTitle>
            <DialogDescription>
              Enter your instance URL. We&apos;ll register an app and redirect you to sign in.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Instance URL" htmlFor="mastodon-instance">
          <Input
            id="mastodon-instance"
            value={instance}
            onChange={(e) => setInstance(e.target.value)}
            placeholder="mastodon.social"
            autoComplete="off"
          />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" disabled={submitting || !instance.trim()}>
            {submitting ? <Spinner /> : null}
            Continue
          </Button>
        </div>
      </form>
    </>
  )
}
