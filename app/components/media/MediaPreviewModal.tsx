import { Download, Trash2, Plus } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import type { AssetSummary } from '~/server/media'

export function MediaPreviewModal({
  asset,
  onClose,
  onDelete,
  onInsert,
}: {
  asset: AssetSummary | null
  onClose: () => void
  onDelete: (id: string) => Promise<void>
  onInsert?: (id: string) => void
}) {
  return (
    <Dialog open={asset !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl">
        {asset ? (
          <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
            <div className="flex min-h-[240px] items-center justify-center rounded bg-neutral-100 dark:bg-neutral-800">
              {asset.kind === 'video' ? (
                <video src={asset.url} controls className="max-h-[70vh] w-full" />
              ) : (
                <img src={asset.url} alt={asset.originalName} className="max-h-[70vh] object-contain" />
              )}
            </div>
            <div className="space-y-3">
              <DialogHeader>
                <DialogTitle className="break-all">{asset.originalName}</DialogTitle>
                <DialogDescription>{asset.mimeType}</DialogDescription>
              </DialogHeader>
              <dl className="space-y-1.5 text-sm text-neutral-600 dark:text-neutral-300">
                {asset.width && asset.height ? (
                  <Row label="Dimensions">{asset.width} × {asset.height}</Row>
                ) : null}
                {asset.duration ? <Row label="Duration">{asset.duration}s</Row> : null}
                <Row label="Size">{formatBytes(asset.size)}</Row>
                <Row label="Uploaded">{new Date(asset.createdAt).toLocaleString()}</Row>
                {asset.uploaderName ? <Row label="By">{asset.uploaderName}</Row> : null}
              </dl>
              <div className="flex flex-col gap-2 pt-2">
                {onInsert ? (
                  <Button
                    type="button"
                    onClick={() => {
                      onInsert(asset.id)
                      onClose()
                    }}
                  >
                    <Plus className="h-4 w-4" /> Insert into Post
                  </Button>
                ) : null}
                <Button variant="outline" asChild>
                  <a href={asset.url} download={asset.originalName}>
                    <Download className="h-4 w-4" /> Download
                  </a>
                </Button>
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    className="text-red-600"
                    onClick={async () => {
                      if (confirm(`Delete ${asset.originalName}?`)) {
                        await onDelete(asset.id)
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </DialogClose>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="truncate font-medium text-neutral-900 dark:text-neutral-100">{children}</dd>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}
