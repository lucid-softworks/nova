import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '~/lib/auth-client'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

export const Route = createFileRoute('/_auth/verify-email')({
  validateSearch: (s: Record<string, unknown>) => ({
    email: typeof s.email === 'string' ? s.email : undefined,
  }),
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const { email } = Route.useSearch()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resend = async () => {
    if (!email) return
    setError(null)
    const { error: e } = await authClient.sendVerificationEmail({ email, callbackURL: '/' })
    if (e) {
      setError(e.message ?? 'Could not resend email')
      return
    }
    setSent(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          {email ? <>We sent a verification link to <strong>{email}</strong>.</> : 'We sent you a verification link.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" className="w-full" onClick={resend} disabled={!email}>
          {sent ? 'Sent — check your inbox again' : 'Resend email'}
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="text-sm text-neutral-500">
          Wrong address?{' '}
          <Link to="/login" className="text-indigo-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
