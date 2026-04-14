import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { cn } from '~/lib/utils'

export function PlatformIcon({
  platform,
  size = 32,
  className,
}: {
  platform: PlatformKey
  size?: number
  className?: string
}) {
  const p = PLATFORMS[platform]
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full text-white font-semibold uppercase',
        className,
      )}
      style={{
        backgroundColor: p.color,
        width: size,
        height: size,
        fontSize: size * 0.45,
      }}
      aria-label={p.label}
      title={p.label}
    >
      {p.label.charAt(0)}
    </div>
  )
}
