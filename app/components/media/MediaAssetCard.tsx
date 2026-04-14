import { Check, Play } from 'lucide-react'
import { cn } from '~/lib/utils'
import type { AssetSummary } from '~/server/media'

export function MediaAssetCard({
  asset,
  size,
  selected,
  onSelect,
  onOpen,
}: {
  asset: AssetSummary
  size: 'sm' | 'md' | 'lg'
  selected: boolean
  onSelect: (id: string, additive: boolean) => void
  onOpen: (asset: AssetSummary) => void
}) {
  const h = size === 'sm' ? 120 : size === 'md' ? 160 : 220
  return (
    <button
      type="button"
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          onSelect(asset.id, true)
        } else {
          onOpen(asset)
        }
      }}
      className={cn(
        'group relative overflow-hidden rounded-md border text-left transition-all',
        selected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-neutral-200 hover:border-neutral-300',
      )}
    >
      <div
        className="relative flex items-center justify-center bg-neutral-100"
        style={{ height: h }}
      >
        {asset.kind === 'video' ? (
          <>
            <video src={asset.url} className="h-full w-full object-cover" muted />
            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
              <Play className="h-10 w-10 text-white drop-shadow" />
            </div>
          </>
        ) : (
          <img src={asset.url} alt={asset.originalName} className="h-full w-full object-cover" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
          {asset.kind === 'other' ? 'File' : asset.kind}
        </span>
        <span
          role="checkbox"
          aria-checked={selected}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(asset.id, true)
          }}
          className={cn(
            'absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border bg-white transition-opacity',
            selected
              ? 'border-indigo-500 bg-indigo-500 text-white opacity-100'
              : 'border-neutral-300 opacity-0 group-hover:opacity-100',
          )}
        >
          {selected ? <Check className="h-3 w-3" /> : null}
        </span>
      </div>
      <div className="space-y-0.5 bg-white p-2">
        <div className="truncate text-xs font-medium text-neutral-900">{asset.originalName}</div>
        <div className="text-[11px] text-neutral-500">{formatBytes(asset.size)}</div>
      </div>
    </button>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}
