import { useEffect, useMemo, useState } from 'react'
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
  const [name, setName] = useState('')
  const [raw, setRaw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setRaw(initial?.hashtags.join(' ') ?? '')
    setError(null)
  }, [open, initial])

  const parsed = useMemo(() => normalizeHashtags(raw), [raw])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ name, hashtags: parsed })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit group' : 'Create hashtag group'}</DialogTitle>
          <DialogDescription>
            Paste your hashtags — one per line, space-separated, with or without #.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Group name" htmlFor="grp-name">
            <Input id="grp-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Hashtags" htmlFor="grp-tags">
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
              {parsed.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {initial ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
