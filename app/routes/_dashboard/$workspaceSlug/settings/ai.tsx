import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Check, Save, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Field } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { useConfirm } from '~/components/ui/confirm'
import { toast } from '~/components/ui/toast'
import { SettingsNav } from '~/components/settings/SettingsNav'
import { useT } from '~/lib/i18n'
import {
  getWorkspaceAiKeys,
  setWorkspaceAiProvider,
  updateWorkspaceAiProvider,
  type WorkspaceAiKeys,
  type WorkspaceAiProviderConfig,
} from '~/server/settings'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/ai')({
  loader: async ({ params }) =>
    getWorkspaceAiKeys({ data: { workspaceSlug: params.workspaceSlug } }),
  component: AiKeysSettings,
})

function AiKeysSettings() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const [data, setData] = useState<WorkspaceAiKeys>(initial)
  const [switching, setSwitching] = useState<string | null>(null)

  const reload = async () => {
    setData(await getWorkspaceAiKeys({ data: { workspaceSlug } }))
  }

  const onSelect = async (providerId: string) => {
    if (providerId === data.active) return
    setSwitching(providerId)
    try {
      await setWorkspaceAiProvider({ data: { workspaceSlug, providerId } })
      await reload()
      toast.success(t('aiKeys.providerUpdated'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('aiKeys.failed'))
    } finally {
      setSwitching(null)
    }
  }

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="ai" />

      <Card>
        <div className="space-y-2 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t('aiKeys.title')}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {t('aiKeys.description')}
          </p>
        </div>
      </Card>

      {data.providers.map((p) => (
        <ProviderCard
          key={p.id}
          workspaceSlug={workspaceSlug}
          provider={p}
          active={data.active === p.id}
          selecting={switching === p.id}
          onSelect={() => onSelect(p.id)}
          onChanged={reload}
        />
      ))}
    </div>
  )
}

function ProviderCard({
  workspaceSlug,
  provider,
  active,
  selecting,
  onSelect,
  onChanged,
}: {
  workspaceSlug: string
  provider: WorkspaceAiProviderConfig
  active: boolean
  selecting: boolean
  onSelect: () => void
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const confirm = useConfirm()
  const [key, setKey] = useState('')
  const [model, setModel] = useState(provider.model ?? '')
  const [baseURL, setBaseURL] = useState(provider.baseURL ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const onSave = async () => {
    setSaving(true)
    try {
      const patch: {
        key?: string | null
        model?: string | null
        baseURL?: string | null
      } = {}
      if (key.trim()) patch.key = key.trim()
      patch.model = model
      if (provider.requiresUserBaseURL) patch.baseURL = baseURL
      await updateWorkspaceAiProvider({
        data: { workspaceSlug, providerId: provider.id, ...patch },
      })
      setKey('')
      await onChanged()
      toast.success(t('aiKeys.saved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('aiKeys.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const onRemove = async () => {
    const ok = await confirm({
      title: t('aiKeys.removeTitle', { provider: provider.label }),
      message: t('aiKeys.confirmRemove', { provider: provider.label }),
      confirmLabel: t('aiKeys.remove'),
      destructive: true,
    })
    if (!ok) return
    setRemoving(true)
    try {
      await updateWorkspaceAiProvider({
        data: { workspaceSlug, providerId: provider.id, key: null },
      })
      await onChanged()
      toast.success(t('aiKeys.keyRemoved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('aiKeys.failed'))
    } finally {
      setRemoving(false)
    }
  }

  const modelLabel = provider.requiresUserModel
    ? t('aiKeys.model')
    : t('aiKeys.modelDefault', { model: provider.defaultModel })

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {provider.label}
              {active ? (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                  <Check className="h-3 w-3" /> {t('aiKeys.active')}
                </span>
              ) : null}
            </h4>
            <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              {provider.keySet ? (
                <>
                  {t('aiKeys.keySet')} · {provider.keyHint ?? '••••'}
                </>
              ) : (
                t('aiKeys.noKey')
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!active ? (
              <Button size="sm" variant="outline" onClick={onSelect} disabled={selecting}>
                {selecting ? <Spinner /> : null} {t('aiKeys.useThis')}
              </Button>
            ) : null}
            {provider.keySet ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={onRemove}
                disabled={removing}
              >
                {removing ? <Spinner /> : <Trash2 className="h-3 w-3" />}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={t('aiKeys.apiKey')} htmlFor={`key-${provider.id}`}>
            <Input
              id={`key-${provider.id}`}
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                provider.keySet
                  ? t('aiKeys.apiKeyPlaceholderSet')
                  : t('aiKeys.apiKeyPlaceholderEmpty')
              }
            />
          </Field>
          <Field label={modelLabel} htmlFor={`model-${provider.id}`}>
            <Input
              id={`model-${provider.id}`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider.defaultModel || t('aiKeys.modelPlaceholder')}
            />
          </Field>
        </div>

        {provider.requiresUserBaseURL ? (
          <Field label={t('aiKeys.baseUrl')} htmlFor={`base-${provider.id}`}>
            <Input
              id={`base-${provider.id}`}
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder={t('aiKeys.baseUrlPlaceholder')}
            />
          </Field>
        ) : null}

        <div className="flex items-center justify-between">
          {provider.signupUrl ? (
            <a
              href={provider.signupUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {t('aiKeys.getKey')}
            </a>
          ) : (
            <span />
          )}
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} {t('aiKeys.save')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
