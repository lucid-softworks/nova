import { useEffect, useState } from 'react'
import { X, Search } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { MediaAssetCard } from './MediaAssetCard'
import { listAssets, type AssetSummary } from '~/server/media'
import { cn } from '~/lib/utils'

export function MediaLibraryPicker({
  open,
  workspaceSlug,
  excludeIds = [],
  onClose,
  onInsert,
}: {
  open: boolean
  workspaceSlug: string
  excludeIds?: string[]
  onClose: () => void
  onInsert: (assets: AssetSummary[]) => void
}) {
  const [assets, setAssets] = useState<AssetSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    listAssets({
      data: {
        workspaceSlug,
        folderId: null,
        search: search || null,
        filter: 'all',
        sort: 'date_desc',
      },
    })
      .then((rows) => {
        if (cancelled) return
        setAssets(rows.filter((r) => !excludeIds.includes(r.id)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, search, workspaceSlug, excludeIds])

  if (!open) return null
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const chosen = assets.filter((a) => selected.has(a.id))

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn('absolute inset-y-0 right-0 flex w-[min(720px,100%)] flex-col bg-white shadow-xl')}>
        <div className="flex items-center justify-between border-b border-neutral-200 p-4">
          <div className="text-lg font-semibold">Media Library</div>
          <button type="button" onClick={onClose} className="rounded p-2 hover:bg-neutral-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-neutral-200 p-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="pl-8"
            />
          </div>
          {loading ? <Spinner /> : null}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {assets.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500">
              No assets yet. Upload via the Media page or the drop zone above.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {assets.map((a) => (
                <MediaAssetCard
                  key={a.id}
                  asset={a}
                  size="sm"
                  selected={selected.has(a.id)}
                  onSelect={() => toggle(a.id)}
                  onOpen={() => toggle(a.id)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200 p-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (chosen.length > 0) onInsert(chosen)
              setSelected(new Set())
              onClose()
            }}
            disabled={chosen.length === 0}
          >
            Insert Selected ({chosen.length})
          </Button>
        </div>
      </div>
    </div>
  )
}
