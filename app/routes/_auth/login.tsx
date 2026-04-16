import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
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

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

export const Route = createFileRoute('/_auth/login')({ component: LoginPage })

function LoginPage() {
  const t = useT()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: FormValues) => {
    setError(null)
    const { error: e } = await authClient.signIn.email({ email: values.email, password: values.password })
    if (e) {
      setError(e.message ?? t('auth.couldNotSignIn'))
      return
    }
    navigate({ to: '/' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.signIn')}</CardTitle>
        <CardDescription>{t('auth.loginDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Field label={t('auth.email')} htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          <Field label={t('auth.password')} htmlFor="password" error={form.formState.errors.password?.message}>
            <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Spinner /> : null}
            {t('auth.signIn')}
          </Button>
        </form>
        <div className="my-4 flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
          <div className="h-px flex-1 bg-neutral-200" />
          {t('common.or')}
          <div className="h-px flex-1 bg-neutral-200" />
        </div>
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              const email = form.getValues('email')
              if (!email) {
                setError(t('auth.enterYourEmailFirst'))
                return
              }
              setError(null)
              const res = await authClient.signIn.magicLink({ email, callbackURL: '/' })
              if (res?.error) setError(res.error.message ?? t('auth.couldNotSendLink'))
              else setError(t('auth.checkInboxForLink'))
            }}
          >
            {t('auth.emailMagicLink')}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              setError(null)
              try {
                await authClient.signIn.passkey()
                navigate({ to: '/' })
              } catch (e) {
                setError(e instanceof Error ? e.message : t('auth.passkeySignInCancelled'))
              }
            }}
          >
            {t('auth.signInPasskey')}
          </Button>
        </div>
        <div className="mt-6 flex justify-between text-sm">
          <Link to="/forgot-password" className="text-indigo-600 hover:underline">
            {t('auth.forgotPassword')}
          </Link>
          <Link to="/register" className="text-indigo-600 hover:underline">
            {t('auth.createAccount')}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
