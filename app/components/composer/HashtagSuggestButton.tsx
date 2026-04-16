import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Spinner } from '~/components/ui/spinner'
import { useT } from '~/lib/i18n'

export function HashtagSuggestButton({
  content,
  platforms,
  workspaceSlug,
  onInsert,
}: {
  content: string
  platforms: string[]
  workspaceSlug: string
  onInsert: (text: string) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const suggest = async () => {
    if (!content.trim()) return
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch('/api/ai/hashtags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceSlug, content, platforms }),
      })
      if (res.ok) {
        const json = (await res.json()) as { hashtags: string[] }
        setTags(json.hashtags)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={suggest}
        title={t('compose.suggestHashtags')}
        className="rounded p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <Sparkles className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2 shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-neutral-500 dark:text-neutral-400">
              <Spinner /> {t('common.loading')}
            </div>
          ) : tags.length === 0 ? (
            <div className="py-2 text-xs text-neutral-500 dark:text-neutral-400">
              {t('common.noResults')}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      onInsert(` ${tag}`)
                      setTags((prev) => prev.filter((t) => t !== tag))
                    }}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onInsert(` ${tags.join(' ')}`)
                    setTags([])
                    setOpen(false)
                  }}
                  className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {t('compose.insertAll')}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs text-neutral-500 hover:underline dark:text-neutral-400"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
