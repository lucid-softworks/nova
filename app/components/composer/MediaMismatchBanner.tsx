import { AlertTriangle } from 'lucide-react'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import type { MediaAsset } from './types'

export type Mismatch = {
  platform: PlatformKey
  message: string
}

export function detectMismatches(
  platforms: PlatformKey[],
  media: MediaAsset[],
): Mismatch[] {
  const out: Mismatch[] = []
  for (const platform of platforms) {
    const req = PLATFORMS[platform].mediaRequirements
    const images = media.filter((m) => m.mimeType.startsWith('image/'))
    const videos = media.filter((m) => m.mimeType.startsWith('video/'))

    if (images.length > req.maxImages) {
      out.push({
        platform,
        message: `${PLATFORMS[platform].label} accepts at most ${req.maxImages} image${req.maxImages === 1 ? '' : 's'} (you have ${images.length}).`,
      })
    }
    if (videos.length > req.maxVideos) {
      out.push({
        platform,
        message: `${PLATFORMS[platform].label} accepts at most ${req.maxVideos} video${req.maxVideos === 1 ? '' : 's'} (you have ${videos.length}).`,
      })
    }
    const badImage = images.find((m) => {
      const ext = (m.originalName.split('.').pop() ?? '').toLowerCase()
      return !req.acceptedImageFormats.includes(ext)
    })
    if (badImage) {
      out.push({
        platform,
        message: `${PLATFORMS[platform].label} doesn't accept ${badImage.originalName.split('.').pop()} images (accepted: ${req.acceptedImageFormats.join(', ') || 'none'}).`,
      })
    }
    const badVideo = videos.find((m) => {
      const ext = (m.originalName.split('.').pop() ?? '').toLowerCase()
      return !req.acceptedVideoFormats.includes(ext)
    })
    if (badVideo) {
      out.push({
        platform,
        message: `${PLATFORMS[platform].label} doesn't accept ${badVideo.originalName.split('.').pop()} videos (accepted: ${req.acceptedVideoFormats.join(', ') || 'none'}).`,
      })
    }
    // Aspect-ratio check: when the platform enforces specific ratios and
    // we know the image dimensions, flag any image that doesn't match.
    if (req.requiredAspectRatios && req.requiredAspectRatios.length > 0) {
      for (const img of images) {
        if (!img.width || !img.height) continue
        const ratio = img.width / img.height
        const ok = req.requiredAspectRatios.some((spec) => {
          const parsed = parseAspectRatio(spec)
          return parsed !== null && withinTolerance(ratio, parsed)
        })
        if (!ok) {
          out.push({
            platform,
            message: `${PLATFORMS[platform].label} requires ${req.requiredAspectRatios.join(' / ')} aspect ratio; "${img.originalName}" is ${img.width}×${img.height} (${ratio.toFixed(2)}:1).`,
          })
          break
        }
      }
    }
  }
  return out
}

function parseAspectRatio(spec: string): number | null {
  const m = spec.match(/^(\d+)\s*[:/]\s*(\d+)$/)
  if (!m) return null
  const w = Number(m[1])
  const h = Number(m[2])
  if (!w || !h) return null
  return w / h
}

function withinTolerance(actual: number, target: number): boolean {
  // 3% slack — lets 1080×1350 (4:5 = 0.80) match 0.78-0.82.
  return Math.abs(actual - target) / target <= 0.03
}

export function MediaMismatchBanner({ items }: { items: Mismatch[] }) {
  if (items.length === 0) return null
  return (
    <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-700" />
        <div className="space-y-1">
          {items.map((m, i) => (
            <div key={i} className="text-yellow-800">
              {m.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
