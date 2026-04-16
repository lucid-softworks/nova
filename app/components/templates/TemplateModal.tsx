import { useEffect, useState } from 'react'
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
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { PLATFORM_KEYS, PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'
import type { TemplateRow } from '~/server/templates'

export function TemplateModal({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: TemplateRow | null
  onSubmit: (input: { name: string; content: string; platforms: PlatformKey[] }) => Promise<void>
}) {
  const t = useT()
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [platforms, setPlatforms] = useState<PlatformKey[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setContent(initial?.content ?? '')
    setPlatforms(initial?.platforms ?? [])
    setError(null)
  }, [open, initial])

  const toggle = (p: PlatformKey) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('templates.nameRequired'))
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ name, content, platforms })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('templates.failedToSave'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? t('templates.editTemplate') : t('templates.createTemplateTitle')}</DialogTitle>
          <DialogDescription>
            {t('templates.reusableDescription')}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <Field label={t('templates.templateName')} htmlFor="tpl-name">
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('templates.content')} htmlFor="tpl-content">
            <textarea
              id="tpl-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[140px] w-full resize-y rounded-md border border-neutral-200 dark:border-neutral-800 p-2 text-sm"
            />
          </Field>
          <div>
            <div className="mb-1 text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('templates.platforms')}</div>
            <div className="flex flex-wrap gap-1">
              {PLATFORM_KEYS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggle(p)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                    platforms.includes(p)
                      ? 'border-transparent text-white'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800',
                  )}
                  style={platforms.includes(p) ? { backgroundColor: PLATFORMS[p].color } : undefined}
                  title={PLATFORMS[p].label}
                >
                  <PlatformIcon platform={p} size={14} />
                  {PLATFORMS[p].label}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {initial ? t('common.save') : t('templates.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
