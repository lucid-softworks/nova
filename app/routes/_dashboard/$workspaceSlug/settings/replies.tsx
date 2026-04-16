import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { SettingsNav } from '~/components/settings/SettingsNav'
import {
  listSavedReplies,
  createSavedReply,
  updateSavedReply,
  deleteSavedReply,
  type SavedReplyRow,
} from '~/server/savedReplies'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/replies')({
  loader: async ({ params }) => ({
    replies: await listSavedReplies({ data: { workspaceSlug: params.workspaceSlug } }),
  }),
  component: SavedRepliesPage,
})

function SavedRepliesPage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData() as { replies: SavedReplyRow[] }
  const [replies, setReplies] = useState<SavedReplyRow[]>(initial.replies)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [shortcut, setShortcut] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    const next = await listSavedReplies({ data: { workspaceSlug } })
    setReplies(next)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setBusy(true)
    setError(null)
    try {
      if (editId) {
        await updateSavedReply({
          data: { workspaceSlug, id: editId, title, content, shortcut: shortcut || null },
        })
      } else {
        await createSavedReply({
          data: { workspaceSlug, title, content, shortcut: shortcut || null },
        })
      }
      setTitle('')
      setContent('')
      setShortcut('')
      setEditId(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (r: SavedReplyRow) => {
    setEditId(r.id)
    setTitle(r.title)
    setContent(r.content)
    setShortcut(r.shortcut ?? '')
  }

  const del = async (id: string) => {
    if (!confirm('Delete this saved reply?')) return
    setBusy(true)
    try {
      await deleteSavedReply({ data: { workspaceSlug, id } })
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="replies" />
      <Card>
        <form className="space-y-3 p-4" onSubmit={save}>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {editId ? t('replies.editReply') : t('replies.newReply')}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('replies.titleLabel')} htmlFor="sr-title">
              <Input
                id="sr-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Thanks for reaching out"
              />
            </Field>
            <Field label={t('replies.shortcut')} htmlFor="sr-sc">
              <Input
                id="sr-sc"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="/thanks"
              />
            </Field>
          </div>
          <Field label={t('replies.contentLabel')} htmlFor="sr-body">
            <textarea
              id="sr-body"
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              placeholder="Hi! Thanks for reaching out — we'll get back to you shortly."
            />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !title.trim() || !content.trim()}>
              {busy ? <Spinner /> : null} {editId ? t('replies.update') : t('replies.save')}
            </Button>
            {editId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditId(null)
                  setTitle('')
                  setContent('')
                  setShortcut('')
                }}
              >
                {t('replies.cancel')}
              </Button>
            ) : null}
          </div>
        </form>
      </Card>
      <Card>
        {replies.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
            {t('replies.noReplies')}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {replies.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {r.title}
                    {r.shortcut ? (
                      <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                        {r.shortcut}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-neutral-600 dark:text-neutral-300 line-clamp-2">
                    {r.content}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => del(r.id)}>
                    <Trash2 className="h-3 w-3 text-red-600" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
