import type { ComponentType, SVGProps } from 'react'
import {
  SiBluesky,
  SiFacebook,
  SiInstagram,
  SiMastodon,
  SiPinterest,
  SiReddit,
  SiThreads,
  SiTiktok,
  SiTumblr,
  SiYoutube,
} from 'react-icons/si'
// LinkedIn and X are in fa6 rather than si due to Simple Icons' brand
// trademark policy for these specific marks.
import { FaLinkedin, FaXTwitter } from 'react-icons/fa6'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { cn } from '~/lib/utils'

const BRAND_ICONS: Record<PlatformKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  bluesky: SiBluesky,
  facebook: SiFacebook,
  instagram: SiInstagram,
  linkedin: FaLinkedin,
  mastodon: SiMastodon,
  pinterest: SiPinterest,
  reddit: SiReddit,
  threads: SiThreads,
  tiktok: SiTiktok,
  tumblr: SiTumblr,
  x: FaXTwitter,
  youtube: SiYoutube,
}

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
  const Icon = BRAND_ICONS[platform]
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full text-white',
        className,
      )}
      style={{
        backgroundColor: p.color,
        width: size,
        height: size,
      }}
      aria-label={p.label}
      title={p.label}
    >
      <Icon width={size * 0.55} height={size * 0.55} fill="currentColor" aria-hidden="true" />
    </div>
  )
}
