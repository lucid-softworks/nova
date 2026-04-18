import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { normalizeHashtags, type HashtagGroupRow } from '~/server/templates'
import { useT } from '~/lib/i18n'

export function HashtagGroupModal({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: HashtagGroupRow | null
  onSubmit: (input: { name: string; hashtags: string[] }) => Promise<void>
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? t('hashtags.editGroup') : t('hashtags.createGroup')}</DialogTitle>
          <DialogDescription>
            {t('hashtags.description')}
          </DialogDescription>
        </DialogHeader>
        {/* Keying by id re-mounts the form when the caller swaps initial,
            so useState re-initializes cleanly without a sync effect. */}
        <HashtagGroupForm
          key={initial?.id ?? 'new'}
          initial={initial}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function HashtagGroupForm({
  initial,
  onSubmit,
  onCancel,
  onSuccess,
}: {
  initial: HashtagGroupRow | null
  onSubmit: (input: { name: string; hashtags: string[] }) => Promise<void>
  onCancel: () => void
  onSuccess: () => void
}) {
  const t = useT()
  const [name, setName] = useState(initial?.name ?? '')
  const [raw, setRaw] = useState(initial?.hashtags.join(' ') ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = useMemo(() => normalizeHashtags(raw), [raw])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('hashtags.nameRequired'))
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ name, hashtags: parsed })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <Field label={t('hashtags.groupName')} htmlFor="grp-name">
        <Input id="grp-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('hashtags.hashtagsLabel')} htmlFor="grp-tags">
        <textarea
          id="grp-tags"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="min-h-[120px] w-full resize-y rounded-md border border-neutral-200 dark:border-neutral-800 p-2 text-sm"
          placeholder="design ux typography product"
        />
      </Field>
      <div>
        <div className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
          {parsed.length} tag{parsed.length === 1 ? '' : 's'} preview
        </div>
        <div className="flex flex-wrap gap-1">
          {parsed.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {initial ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  )
}
