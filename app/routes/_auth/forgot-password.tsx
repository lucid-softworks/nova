import { createFileRoute, Link } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { authClient } from '~/lib/auth-client'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { useT } from '~/lib/i18n'

const schema = z.object({ email: z.string().email('Enter a valid email') })
type FormValues = z.infer<typeof schema>

export const Route = createFileRoute('/_auth/forgot-password')({ component: ForgotPasswordPage })

function ForgotPasswordPage() {
  const t = useT()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = async (values: FormValues) => {
    setError(null)
    const { error: e } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: '/reset-password',
    })
    if (e) {
      setError(e.message ?? t('auth.couldNotSendResetEmail'))
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.checkYourInbox')}</CardTitle>
          <CardDescription>{t('auth.ifAccountExists')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/login" className="text-sm text-indigo-600 hover:underline">
            {t('auth.backToSignIn')}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.resetPassword')}</CardTitle>
        <CardDescription>{t('auth.resetEmailDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Field label={t('auth.email')} htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Spinner /> : null}
            {t('auth.sendResetLink')}
          </Button>
        </form>
        <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
          <Link to="/login" className="text-indigo-600 hover:underline">
            {t('auth.backToSignIn')}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
