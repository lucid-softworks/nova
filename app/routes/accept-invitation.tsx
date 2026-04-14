import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { loadSessionContext } from '~/server/session.server'
import { acceptInvitation, loadInvitation } from '~/server/invitations'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'

export const Route = createFileRoute('/accept-invitation')({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === 'string' ? s.token : '',
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => {
    if (!deps.token) throw redirect({ to: '/login' })
    const ctx = await loadSessionContext()
    if (!ctx.user) {
      throw redirect({ to: '/login', search: { next: `/accept-invitation?token=${deps.token}` } as never })
    }
    const invitation = await loadInvitation({ data: { invitationId: deps.token } })
    return { invitation, token: deps.token }
  },
  component: AcceptInvitationPage,
})

function AcceptInvitationPage() {
  const { invitation, token } = Route.useLoaderData()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'accepted' | 'rejected' | null>(null)

  const onAccept = async () => {
    setBusy('accept')
    setError(null)
    try {
      const res = await acceptInvitation({ data: { invitationId: token } })
      setDone('accepted')
      if (res.slug) {
        navigate({ to: '/$workspaceSlug', params: { workspaceSlug: res.slug } })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept')
    } finally {
      setBusy(null)
    }
  }

  const onReject = async () => {
    setBusy('reject')
    setError(null)
    try {
      await acceptInvitation({ data: { invitationId: token, reject: true } })
      setDone('rejected')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decline')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (done === 'rejected') {
      const t = setTimeout(() => navigate({ to: '/' }), 1500)
      return () => clearTimeout(t)
    }
  }, [done, navigate])

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <Card>
          <div className="p-6 text-center">
            <h1 className="text-lg font-semibold">Invitation not found</h1>
            <p className="mt-1 text-sm text-neutral-500">
              It may have expired or already been used.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <Card>
        <div className="w-[min(480px,95vw)] space-y-4 p-6">
          <h1 className="text-xl font-semibold">You're invited to join {invitation.orgName}</h1>
          <p className="text-sm text-neutral-600">
            {invitation.inviterName ?? 'A workspace admin'} has invited you to join{' '}
            <strong>{invitation.orgName}</strong> as a{' '}
            <span className="font-medium">{invitation.role}</span>.
          </p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {done === 'rejected' ? (
            <p className="text-sm text-neutral-500">Invitation declined.</p>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onReject} disabled={busy !== null}>
                {busy === 'reject' ? <Spinner /> : null} Decline
              </Button>
              <Button onClick={onAccept} disabled={busy !== null}>
                {busy === 'accept' ? <Spinner /> : null} Accept invitation
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
