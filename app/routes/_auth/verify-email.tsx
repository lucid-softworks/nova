import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '~/lib/auth-client'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_auth/verify-email')({
  validateSearch: (s: Record<string, unknown>) => ({
    email: typeof s.email === 'string' ? s.email : undefined,
  }),
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const t = useT()
  const { email } = Route.useSearch()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resend = async () => {
    if (!email) return
    setError(null)
    const { error: e } = await authClient.sendVerificationEmail({ email, callbackURL: '/' })
    if (e) {
      setError(e.message ?? t('auth.couldNotResendEmail'))
      return
    }
    setSent(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.verifyEmail')}</CardTitle>
        <CardDescription>
          {email ? <>{t('auth.verificationLinkSent', { email })}</> : t('auth.weSentVerification')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" className="w-full" onClick={resend} disabled={!email}>
          {sent ? t('auth.sentCheckInboxAgain') : t('auth.resendEmail')}
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {t('auth.wrongAddress')}{' '}
          <Link to="/login" className="text-indigo-600 hover:underline">
            {t('auth.backToSignIn')}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
