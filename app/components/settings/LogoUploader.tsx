import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'

export function LogoUploader({
  workspaceSlug,
  value,
  onChange,
  disabled,
}: {
  workspaceSlug: string
  value: string
  onChange: (url: string) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `/api/media/upload?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
        { method: 'POST', body: form, credentials: 'same-origin' },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Upload failed (${res.status})`)
      }
      const asset = (await res.json()) as { url: string }
      onChange(asset.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {value ? (
          <img
            src={value}
            alt=""
            className="h-10 w-10 rounded border border-neutral-200 object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-neutral-300 text-neutral-400">
            <Upload className="h-4 w-4" />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
        >
          {uploading ? <Spinner /> : <Upload className="h-3 w-3" />}
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange('')}
            disabled={disabled || uploading}
          >
            <X className="h-3 w-3" /> Remove
          </Button>
        ) : null}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…or paste an HTTPS image URL"
        disabled={disabled}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
