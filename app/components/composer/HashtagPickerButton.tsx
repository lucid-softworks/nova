import { useEffect, useState } from 'react'
import { Hash } from 'lucide-react'
import { useT } from '~/lib/i18n'
import { listHashtagGroups, type HashtagGroupRow } from '~/server/templates'

export function HashtagPickerButton({
  workspaceSlug,
  onInsert,
}: {
  workspaceSlug: string
  onInsert: (text: string) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<HashtagGroupRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || groups !== null) return
    let cancelled = false
    setLoading(true)
    listHashtagGroups({ data: { workspaceSlug } })
      .then((rows) => {
        if (!cancelled) setGroups(rows)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, groups, workspaceSlug])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('compose.hashtagGroups')}
        className="rounded p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <Hash className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1 shadow-lg">
          {loading ? (
            <div className="px-2 py-3 text-xs text-neutral-500 dark:text-neutral-400">{t('common.loading')}</div>
          ) : !groups || groups.length === 0 ? (
            <div className="px-2 py-3 text-xs text-neutral-500 dark:text-neutral-400">
              {t('compose.noHashtagGroupsYet')}
            </div>
          ) : (
            groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  onInsert(g.hashtags.join(' '))
                  setOpen(false)
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <div className="font-medium text-neutral-900 dark:text-neutral-100">{g.name}</div>
                <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {g.hashtags.slice(0, 6).join(' ')}
                  {g.hashtags.length > 6 ? ' …' : ''}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
