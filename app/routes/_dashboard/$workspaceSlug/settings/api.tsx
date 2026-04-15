import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { SettingsNav } from '~/components/settings/SettingsNav'
import {
  listApiKeys,
  createApiKey,
  deleteApiKey,
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  type ApiKeyRow,
  type WebhookRow,
} from '~/server/settings'

const EVENTS = [
  'post.published',
  'post.failed',
  'post.scheduled',
  'post.approved',
  'post.rejected',
  'campaign.on_hold',
] as const

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/api')({
  loader: async ({ params }) => {
    const [keys, webhooks] = await Promise.all([
      listApiKeys({ data: { workspaceSlug: params.workspaceSlug } }),
      listWebhooks({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    return { keys, webhooks }
  },
  component: ApiSettings,
})

function ApiSettings() {
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const [keys, setKeys] = useState<ApiKeyRow[]>(initial.keys)
  const [webhooks, setWebhooks] = useState<WebhookRow[]>(initial.webhooks)
  const [newKeyName, setNewKeyName] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  const [revealed, setRevealed] = useState<{ id: string; plaintext: string } | null>(null)

  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([...EVENTS])
  const [creatingWebhook, setCreatingWebhook] = useState(false)
  const [webhookSecret, setWebhookSecret] = useState<{ id: string; secret: string } | null>(null)

  const reload = async () => {
    const [k, w] = await Promise.all([
      listApiKeys({ data: { workspaceSlug } }),
      listWebhooks({ data: { workspaceSlug } }),
    ])
    setKeys(k)
    setWebhooks(w)
  }

  const onCreateKey = async () => {
    if (!newKeyName.trim()) return
    setCreatingKey(true)
    try {
      const { id, plaintext } = await createApiKey({ data: { workspaceSlug, name: newKeyName.trim() } })
      setRevealed({ id, plaintext })
      setNewKeyName('')
      await reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreatingKey(false)
    }
  }

  const onDeleteKey = async (key: ApiKeyRow) => {
    if (!confirm(`Delete "${key.name}"? Apps using it will stop working immediately.`)) return
    await deleteApiKey({ data: { workspaceSlug, keyId: key.id } })
    await reload()
  }

  const toggleEvent = (e: string) =>
    setNewWebhookEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]))

  const onCreateWebhook = async () => {
    if (!newWebhookUrl.trim()) return
    setCreatingWebhook(true)
    try {
      const { id, secret } = await createWebhook({
        data: { workspaceSlug, url: newWebhookUrl.trim(), events: newWebhookEvents },
      })
      setWebhookSecret({ id, secret })
      setNewWebhookUrl('')
      setNewWebhookEvents([...EVENTS])
      await reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreatingWebhook(false)
    }
  }

  const onToggleWebhook = async (w: WebhookRow, value: boolean) => {
    await updateWebhook({ data: { workspaceSlug, webhookId: w.id, isActive: value } })
    await reload()
  }

  const onDeleteWebhook = async (w: WebhookRow) => {
    if (!confirm('Delete this webhook?')) return
    await deleteWebhook({ data: { workspaceSlug, webhookId: w.id } })
    await reload()
  }

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="api" />

      <Card>
        <div className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">API keys</h3>
          {keys.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">No API keys yet.</p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-md border border-neutral-200 dark:border-neutral-800 p-2">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{k.name}</div>
                    <code className="text-xs text-neutral-500 dark:text-neutral-400">{k.maskedKey}</code>
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onDeleteKey(k)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Field label="New key name" htmlFor="key-name" className="flex-1">
              <Input
                id="key-name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Production CLI"
              />
            </Field>
            <Button onClick={onCreateKey} disabled={creatingKey || !newKeyName.trim()}>
              {creatingKey ? <Spinner /> : <Plus className="h-4 w-4" />} Create
            </Button>
          </div>
          {revealed ? (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 p-3 text-sm">
              <div className="font-semibold text-indigo-800">Save this key — it won&apos;t be shown again.</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white dark:bg-neutral-900 px-2 py-1 text-xs">
                  {revealed.plaintext}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(revealed.plaintext).catch(() => {})
                  }}
                >
                  <Copy className="h-3 w-3" /> Copy
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Webhooks</h3>
          {webhooks.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">No webhooks yet.</p>
          ) : (
            <div className="space-y-2">
              {webhooks.map((w) => (
                <div key={w.id} className="space-y-1 rounded-md border border-neutral-200 dark:border-neutral-800 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <code className="min-w-0 flex-1 truncate text-xs">{w.url}</code>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={w.isActive}
                        onChange={(e) => onToggleWebhook(w, e.target.checked)}
                      />
                      Active
                    </label>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onDeleteWebhook(w)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {w.events.map((e) => (
                      <span
                        key={e}
                        className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:text-neutral-200"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Field label="New webhook URL" htmlFor="wh-url">
              <Input
                id="wh-url"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                placeholder="https://example.com/webhooks/socialhub"
              />
            </Field>
            <div>
              <div className="mb-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">Events</div>
              <div className="flex flex-wrap gap-2">
                {EVENTS.map((e) => (
                  <label key={e} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={newWebhookEvents.includes(e)}
                      onChange={() => toggleEvent(e)}
                    />
                    {e}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={onCreateWebhook} disabled={creatingWebhook || !newWebhookUrl.trim()}>
                {creatingWebhook ? <Spinner /> : <Plus className="h-4 w-4" />} Add webhook
              </Button>
            </div>
          </div>
          {webhookSecret ? (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 p-3 text-sm">
              <div className="font-semibold text-indigo-800">
                Save this webhook secret — it won&apos;t be shown again.
              </div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white dark:bg-neutral-900 px-2 py-1 text-xs">
                  {webhookSecret.secret}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookSecret.secret).catch(() => {})
                  }}
                >
                  <Copy className="h-3 w-3" /> Copy
                </Button>
              </div>
              <p className="mt-2 text-xs text-indigo-700 dark:text-indigo-300">
                Requests are signed with <code>X-SocialHub-Signature: sha256={'{hmac}'}</code>.
              </p>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
