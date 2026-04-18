import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Field } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { useConfirm } from '~/components/ui/confirm'
import { toast } from '~/components/ui/toast'
import { SettingsNav } from '~/components/settings/SettingsNav'
import { getWorkspaceAiKeys, setWorkspaceAnthropicKey, type WorkspaceAiKeys } from '~/server/settings'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/ai')({
  loader: async ({ params }) =>
    getWorkspaceAiKeys({ data: { workspaceSlug: params.workspaceSlug } }),
  component: AiKeysSettings,
})

function AiKeysSettings() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const confirm = useConfirm()
  const [keys, setKeys] = useState<WorkspaceAiKeys>(initial)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const reload = async () => {
    setKeys(await getWorkspaceAiKeys({ data: { workspaceSlug } }))
  }

  const onSave = async () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await setWorkspaceAnthropicKey({ data: { workspaceSlug, key: trimmed } })
      setInput('')
      await reload()
      toast.success(t('aiKeys.saved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('aiKeys.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const onRemove = async () => {
    const ok = await confirm({
      title: t('aiKeys.remove'),
      message: t('aiKeys.confirmRemove'),
      confirmLabel: t('aiKeys.remove'),
      destructive: true,
    })
    if (!ok) return
    setRemoving(true)
    try {
      await setWorkspaceAnthropicKey({ data: { workspaceSlug, key: null } })
      await reload()
      toast.success(t('aiKeys.removed'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('aiKeys.saveFailed'))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="ai" />

      <Card>
        <div className="space-y-4 p-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {t('aiKeys.title')}
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {t('aiKeys.description')}
            </p>
          </div>

          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
            <div className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('aiKeys.currentKey')}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="text-xs text-neutral-900 dark:text-neutral-100">
                {keys.anthropicSet ? (keys.anthropicHint ?? '••••') : t('aiKeys.notSet')}
              </code>
              {keys.anthropicSet ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={onRemove}
                  disabled={removing}
                >
                  {removing ? <Spinner /> : <Trash2 className="h-3 w-3" />} {t('aiKeys.remove')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <Field label={t('aiKeys.anthropicLabel')} htmlFor="anthropic-key" className="flex-1">
              <Input
                id="anthropic-key"
                type="password"
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('aiKeys.anthropicPlaceholder')}
              />
            </Field>
            <Button onClick={onSave} disabled={saving || !input.trim()}>
              {saving ? <Spinner /> : <Save className="h-4 w-4" />} {t('aiKeys.save')}
            </Button>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('aiKeys.anthropicHint')}</p>
        </div>
      </Card>
    </div>
  )
}
