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

const schema = z
  .object({
    password: z.string().min(8, 'Min 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
type FormValues = z.infer<typeof schema>

export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === 'string' ? s.token : undefined,
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const t = useT()
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  })

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.invalidLink')}</CardTitle>
          <CardDescription>{t('auth.resetLinkMissingToken')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/forgot-password" className="text-sm text-indigo-600 hover:underline">
            {t('auth.requestNewOne')}
          </Link>
        </CardContent>
      </Card>
    )
  }

  const onSubmit = async (values: FormValues) => {
    setError(null)
    const { error: e } = await authClient.resetPassword({ newPassword: values.password, token })
    if (e) {
      setError(e.message ?? t('auth.couldNotResetPassword'))
      return
    }
    navigate({ to: '/login' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.setNewPassword')}</CardTitle>
        <CardDescription>{t('auth.chooseRememberable')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Field label={t('auth.newPassword')} htmlFor="password" error={form.formState.errors.password?.message}>
            <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
          </Field>
          <Field label={t('auth.confirmPassword')} htmlFor="confirm" error={form.formState.errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Spinner /> : null}
            {t('auth.resetPassword')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
