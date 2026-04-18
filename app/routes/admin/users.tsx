import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Download, MoreHorizontal, UserPlus } from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown'
import {
  listAdminUsers,
  inviteAdminUser,
  revokeAdminUserSessions,
  resetAdminUserTwoFactor,
  markAdminUserVerified,
  resendAdminVerification,
  type AdminUserRow,
} from '~/server/admin'
import { authClient } from '~/lib/auth-client'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/admin/users')({
  loader: async () => ({ users: await listAdminUsers() }),
  component: UsersPage,
})

function UsersPage() {
  const t = useT()
  const initial = Route.useLoaderData()
  const [rows, setRows] = useState<AdminUserRow[]>(initial.users)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const reload = async () => setRows(await listAdminUsers())

  const onBan = async (u: AdminUserRow) => {
    const reason = prompt(`Ban ${u.email}?\n\nOptional reason:`)
    if (reason === null) return
    setBusy(u.id)
    try {
      await authClient.admin.banUser({ userId: u.id, banReason: reason || 'Admin ban' })
      await reload()
    } finally {
      setBusy(null)
    }
  }
  const onUnban = async (u: AdminUserRow) => {
    setBusy(u.id)
    try {
      await authClient.admin.unbanUser({ userId: u.id })
      await reload()
    } finally {
      setBusy(null)
    }
  }
  const onImpersonate = async (u: AdminUserRow) => {
    setBusy(u.id)
    try {
      await authClient.admin.impersonateUser({ userId: u.id })
      window.location.href = '/'
    } finally {
      setBusy(null)
    }
  }
  const onRevokeSessions = async (u: AdminUserRow) => {
    if (!confirm(`Revoke all sessions for ${u.email}? They'll be signed out everywhere.`)) return
    setBusy(u.id)
    try {
      const res = await revokeAdminUserSessions({ data: { userId: u.id } })
      alert(`Revoked ${res.revoked} session${res.revoked === 1 ? '' : 's'}.`)
    } finally {
      setBusy(null)
    }
  }
  const onResetTwoFactor = async (u: AdminUserRow) => {
    if (!confirm(`Reset 2FA for ${u.email}? They'll be able to sign in with just their password.`)) return
    setBusy(u.id)
    try {
      await resetAdminUserTwoFactor({ data: { userId: u.id } })
      alert('2FA reset. User can enroll again in security settings.')
    } finally {
      setBusy(null)
    }
  }
  const onMarkVerified = async (u: AdminUserRow) => {
    setBusy(u.id)
    try {
      await markAdminUserVerified({ data: { userId: u.id } })
      await reload()
    } finally {
      setBusy(null)
    }
  }
  const onResendVerification = async (u: AdminUserRow) => {
    setBusy(u.id)
    try {
      await resendAdminVerification({ data: { userId: u.id } })
      alert(`Verification email sent to ${u.email}.`)
    } finally {
      setBusy(null)
    }
  }

  const filtered = rows.filter((r) => {
    const q = filter.toLowerCase()
    return !q || r.email.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
  })

  const exportUsersCsv = () => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/api/admin/users/export'
    document.body.appendChild(form)
    form.submit()
    form.remove()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('admin.filterPlaceholder')}
          className="max-w-sm"
        />
        <div className="flex-1" />
        <Button variant="outline" onClick={exportUsersCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <InviteUserButton onInvited={reload} />
      </div>
      <Card>
        <div className="overflow-hidden rounded-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                <th className="px-3 py-2">{t('admin.users')}</th>
                <th className="px-3 py-2">{t('team.role')}</th>
                <th className="px-3 py-2">{t('billing.status')}</th>
                <th className="px-3 py-2">{t('team.joined')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">{u.name}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{u.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        u.role === 'admin'
                          ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200',
                      )}
                    >
                      {u.role ?? 'user'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {u.banned ? (
                        <span className="rounded-full bg-red-50 dark:bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300 w-fit">
                          Banned
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('admin.active')}</span>
                      )}
                      {!u.emailVerified ? (
                        <span className="rounded-full bg-yellow-50 dark:bg-yellow-950/40 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-300 w-fit">
                          Unverified
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onImpersonate(u)}
                        disabled={busy === u.id}
                      >
                        {busy === u.id ? <Spinner /> : null} Impersonate
                      </Button>
                      {u.banned ? (
                        <Button size="sm" variant="outline" onClick={() => onUnban(u)} disabled={busy === u.id}>
                          Unban
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => onBan(u)}
                          disabled={busy === u.id}
                        >
                          Ban
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" aria-label="More actions" disabled={busy === u.id}>
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {!u.emailVerified ? (
                            <>
                              <DropdownMenuItem onSelect={() => onResendVerification(u)}>
                                Resend verification email
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => onMarkVerified(u)}>
                                Mark verified
                              </DropdownMenuItem>
                            </>
                          ) : null}
                          <DropdownMenuItem onSelect={() => onRevokeSessions(u)}>
                            Revoke all sessions
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => onResetTwoFactor(u)}>
                            Reset 2FA
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function InviteUserButton({ onInvited }: { onInvited: () => Promise<void> }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await inviteAdminUser({ data: { email, name } })
      if (res.ok) {
        setSentTo(email)
        setEmail('')
        setName('')
        await onInvited()
      } else {
        setError(res.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setEmail('')
    setName('')
    setError(null)
    setSentTo(null)
    setBusy(false)
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
          <UserPlus className="h-4 w-4" /> {t('admin.inviteUser')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {sentTo ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('admin.invitationSent')}</DialogTitle>
              <DialogDescription>
                A magic-link has been emailed to <strong>{sentTo}</strong>. They can click it to
                sign in. Bypasses the sign-ups toggle.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('admin.inviteUser')}</DialogTitle>
              <DialogDescription>
                Creates an account and emails a one-click sign-in link. The user is marked
                verified automatically since you're vouching for them.
              </DialogDescription>
            </DialogHeader>
            <Field label="Name" htmlFor="invite-name">
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Email" htmlFor="invite-email">
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !email.trim() || !name.trim()}>
                {busy ? <Spinner /> : null} Send invite
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
