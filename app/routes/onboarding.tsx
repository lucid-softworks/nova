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
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
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
        <CardTitle>Create your workspace</CardTitle>
        <CardDescription>You can rename or invite teammates anytime.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={form.handleSubmit(onNext)}>
          <Field label="Workspace name" htmlFor="name" error={form.formState.errors.name?.message}>
            <Input id="name" value={nameValue} onChange={handleNameChange} placeholder="Acme Inc." />
          </Field>
          <Field
            label="URL slug"
            htmlFor="slug"
            error={form.formState.errors.slug?.message}
            hint="Used in your workspace URL"
          >
            <Input id="slug" {...form.register('slug')} placeholder="acme" />
          </Field>
          <Button type="submit" className="w-full">
            Continue
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
  const form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { invites: [{ email: '', role: 'editor' }] },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'invites' })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite your team</CardTitle>
        <CardDescription>You can add more people later from Settings.</CardDescription>
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
                  className="h-10 rounded-md border border-neutral-200 bg-white px-2 text-sm"
                  {...form.register(`invites.${i}.role` as const)}
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
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
              <Plus className="h-4 w-4" /> Add another
            </Button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="ghost" onClick={onBack}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSubmit({ invites: [] })}
                disabled={isSubmitting}
              >
                Skip for now
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Spinner /> : null}
                Create workspace
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Step3({ onDone }: { onDone: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;re all set!</CardTitle>
        <CardDescription>Your workspace is ready.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <Check className="h-6 w-6" />
          </div>
        </div>
        <Button className="w-full" onClick={onDone}>
          Go to dashboard
        </Button>
      </CardContent>
    </Card>
  )
}
