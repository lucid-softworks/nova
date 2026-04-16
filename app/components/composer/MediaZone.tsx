import { useRef, useState } from 'react'
import { Upload, X, FolderOpen } from 'lucide-react'
import { useT } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { MediaLibraryPicker } from '~/components/media/MediaLibraryPicker'
import type { MediaAsset } from './types'

export function MediaZone({
  workspaceSlug,
  mediaIds,
  mediaById,
  onUploaded,
  onRemove,
}: {
  workspaceSlug: string
  mediaIds: string[]
  mediaById: Record<string, MediaAsset>
  onUploaded: (assets: MediaAsset[]) => void
  onRemove: (mediaId: string) => void
}) {
  const t = useT()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    setError(null)
    const names = files.map((f) => f.name)
    setUploading((prev) => [...prev, ...names])
    try {
      const uploaded: MediaAsset[] = []
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch(
          `/api/media/upload?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
          { method: 'POST', body: form },
        )
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error ?? `Upload failed (${res.status})`)
        }
        uploaded.push((await res.json()) as MediaAsset)
      }
      onUploaded(uploaded)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading((prev) => prev.filter((n) => !names.includes(n)))
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files)
    void uploadFiles(files)
  }

  return (
    <div className="space-y-2">
      <div
        className={`rounded-md border-2 border-dashed p-6 text-center transition-colors ${
          dragActive ? 'border-indigo-400 bg-indigo-50' : 'border-neutral-300 bg-neutral-50'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto mb-2 h-6 w-6 text-neutral-400 dark:text-neutral-500" />
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('compose.dragFilesHereOr')}</p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            {t('compose.uploadFiles')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
            <FolderOpen className="h-4 w-4" /> {t('compose.openMediaLibrary')}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept="image/*,video/*"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            void uploadFiles(files)
            e.target.value = ''
          }}
        />
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {(mediaIds.length > 0 || uploading.length > 0) ? (
        <div className="flex flex-wrap gap-2">
          {mediaIds.map((id) => {
            const m = mediaById[id]
            if (!m) return null
            return (
              <div
                key={id}
                className="group relative h-20 w-20 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800"
                title={m.originalName}
              >
                {m.mimeType.startsWith('video/') ? (
                  <video src={m.url} className="h-full w-full object-cover" />
                ) : (
                  <img src={m.url} alt={m.originalName} className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
          {uploading.map((name) => (
            <div
              key={name}
              className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 dark:bg-neutral-900"
            >
              <Spinner />
            </div>
          ))}
        </div>
      ) : null}
      <MediaLibraryPicker
        open={pickerOpen}
        workspaceSlug={workspaceSlug}
        excludeIds={mediaIds}
        onClose={() => setPickerOpen(false)}
        onInsert={(assets) =>
          onUploaded(
            assets.map((a) => ({
              id: a.id,
              url: a.url,
              originalName: a.originalName,
              mimeType: a.mimeType,
              size: a.size,
              width: a.width,
              height: a.height,
            })),
          )
        }
      />
    </div>
  )
}
