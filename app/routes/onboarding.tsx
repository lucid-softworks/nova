import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Check } from 'lucide-react'
import { getSessionContext } from '~/server/auth-context'
import { createWorkspace } from '~/server/workspaces'
import { slugify } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { useT } from '~/lib/i18n'

const step1Schema = z.object({
  name: z.string().min(1, 'Required').max(80),
  slug: z
    .string()
    .min(1, 'Required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers, hyphens'),
})
type Step1Values = z.infer<typeof step1Schema>

const step2Schema = z.object({
  invites: z
    .array(
      z.object({
        email: z.string().email('Enter a valid email').or(z.literal('')),
        role: z.enum(['admin', 'manager', 'editor', 'viewer']),
      }),
    )
    .default([]),
})
type Step2Values = z.infer<typeof step2Schema>

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async () => {
    const ctx = await getSessionContext()
    if (!ctx.user) throw redirect({ to: '/login' })
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdSlug, setCreatedSlug] = useState<string | null>(null)

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-2 w-16 rounded-full ${n <= step ? 'bg-indigo-500' : 'bg-neutral-200'}`}
            />
          ))}
        </div>
        {step === 1 ? (
          <Step1
            initial={step1Data}
            onNext={(v) => {
              setStep1Data(v)
              setStep(2)
            }}
          />
        ) : step === 2 ? (
          <Step2
            onBack={() => setStep(1)}
            onSubmit={async (v) => {
              if (!step1Data) return
              setError(null)
              setIsSubmitting(true)
              try {
                const invites = v.invites.filter((i) => i.email !== '')
                const result = await createWorkspace({
                  data: { name: step1Data.name, slug: step1Data.slug, invites },
                })
                setCreatedSlug(result.slug)
                setStep(3)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to create workspace')
              } finally {
                setIsSubmitting(false)
              }
            }}
            error={error}
            isSubmitting={isSubmitting}
          />
        ) : (
          <Step3
            onDone={() => {
              if (createdSlug) {
                navigate({ to: '/$workspaceSlug/compose', params: { workspaceSlug: createdSlug } })
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

function Step1({ initial, onNext }: { initial: Step1Values | null; onNext: (v: Step1Values) => void }) {
  const t = useT()
  const form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: initial ?? { name: '', slug: '' },
  })
  const nameValue = form.watch('name')

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    form.setValue('name', e.target.value)
    if (!form.formState.dirtyFields.slug) {
      form.setValue('slug', slugify(e.target.value))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('onboarding.createWorkspace')}</CardTitle>
        <CardDescription>{t('onboarding.renameAnytime')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={form.handleSubmit(onNext)}>
          <Field label={t('onboarding.workspaceName')} htmlFor="name" error={form.formState.errors.name?.message}>
            <Input id="name" value={nameValue} onChange={handleNameChange} placeholder={t('onboarding.workspaceNamePlaceholder')} />
          </Field>
          <Field
            label={t('onboarding.urlSlug')}
            htmlFor="slug"
            error={form.formState.errors.slug?.message}
            hint={t('onboarding.urlSlugHint')}
          >
            <Input id="slug" {...form.register('slug')} placeholder="acme" />
          </Field>
          <Button type="submit" className="w-full">
            {t('onboarding.continue')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function Step2({
  onBack,
  onSubmit,
  error,
  isSubmitting,
}: {
  onBack: () => void
  onSubmit: (v: Step2Values) => void
  error: string | null
  isSubmitting: boolean
}) {
  const t = useT()
  const form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { invites: [{ email: '', role: 'editor' }] },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'invites' })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('onboarding.inviteTeam')}</CardTitle>
        <CardDescription>{t('onboarding.addMoreLater')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-2">
            {fields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  placeholder="teammate@example.com"
                  {...form.register(`invites.${i}.email` as const)}
                />
                <select
                  className="h-10 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 text-sm"
                  {...form.register(`invites.${i}.role` as const)}
                >
                  <option value="admin">{t('team.admin')}</option>
                  <option value="manager">{t('team.manager')}</option>
                  <option value="editor">{t('team.editor')}</option>
                  <option value="viewer">{t('team.viewer')}</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(i)}
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ email: '', role: 'editor' })}
            >
              <Plus className="h-4 w-4" /> {t('team.add')}
            </Button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="ghost" onClick={onBack}>
              {t('common.back')}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSubmit({ invites: [] })}
                disabled={isSubmitting}
              >
                {t('onboarding.skipForNow')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Spinner /> : null}
                {t('onboarding.createWorkspaceButton')}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Step3({ onDone }: { onDone: () => void }) {
  const t = useT()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('onboarding.allSet')}</CardTitle>
        <CardDescription>{t('onboarding.workspaceReady')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <Check className="h-6 w-6" />
          </div>
        </div>
        <Button className="w-full" onClick={onDone}>
          {t('onboarding.goToDashboard')}
        </Button>
      </CardContent>
    </Card>
  )
}
