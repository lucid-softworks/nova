import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { loadSessionContext } from '~/server/session.server'
import { acceptInvitation, loadInvitation } from '~/server/invitations'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { useT } from '~/lib/i18n'

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
  const t = useT()
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
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-4">
        <Card>
          <div className="p-6 text-center">
            <h1 className="text-lg font-semibold">{t('invitation.notFound')}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {t('invitation.expiredOrUsed')}
            </p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-4">
      <Card>
        <div className="w-[min(480px,95vw)] space-y-4 p-6">
          <h1 className="text-xl font-semibold">{t('invitation.youreInvited')}</h1>
          <p className="text-sm text-neutral-600">
            {t('invitation.hasInvited', { name: invitation.inviterName ?? 'A workspace admin', workspace: invitation.orgName })}{' '}
            {t('invitation.asRole', { role: invitation.role })}
          </p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {done === 'rejected' ? (
            <p className="text-sm text-neutral-500">{t('invitation.declined')}</p>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onReject} disabled={busy !== null}>
                {busy === 'reject' ? <Spinner /> : null} {t('invitation.decline')}
              </Button>
              <Button onClick={onAccept} disabled={busy !== null}>
                {busy === 'accept' ? <Spinner /> : null} {t('invitation.accept')}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
