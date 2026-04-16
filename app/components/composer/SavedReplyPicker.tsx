import { useEffect, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useT } from '~/lib/i18n'
import { listSavedReplies, type SavedReplyRow } from '~/server/savedReplies'

export function SavedReplyPicker({
  workspaceSlug,
  onPick,
}: {
  workspaceSlug: string
  onPick: (content: string) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [replies, setReplies] = useState<SavedReplyRow[]>([])
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    listSavedReplies({ data: { workspaceSlug } }).then(setReplies).catch(() => {})
  }, [open, workspaceSlug])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = replies.filter(
    (r) =>
      !query ||
      r.title.toLowerCase().includes(query.toLowerCase()) ||
      (r.shortcut && r.shortcut.toLowerCase().includes(query.toLowerCase())),
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/10"
        title="Insert saved reply"
      >
        <MessageSquare className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-30 mb-1 w-72 rounded-md border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('compose.searchReplies')}
            className="mb-1 w-full rounded border border-neutral-200 bg-white px-2 py-1 text-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            autoFocus
          />
          {filtered.length === 0 ? (
            <p className="py-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
              {replies.length === 0 ? t('compose.noRepliesYet') : t('compose.noMatch')}
            </p>
          ) : (
            <ul className="max-h-48 overflow-auto">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(r.content)
                      setOpen(false)
                      setQuery('')
                    }}
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-white/10"
                  >
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {r.title}
                      {r.shortcut ? (
                        <span className="ml-1 text-xs text-neutral-500 dark:text-neutral-400">
                          {r.shortcut}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {r.content}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
