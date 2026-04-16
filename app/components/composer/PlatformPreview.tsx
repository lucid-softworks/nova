import { useState } from 'react'
import {
  Heart,
  MessageCircle,
  Repeat2,
  Share2,
  ThumbsUp,
  Send,
  Bookmark,
  Globe,
  Eye,
} from 'lucide-react'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'

export interface PlatformPreviewProps {
  content: string
  platforms: PlatformKey[]
  accountHandle: string
  accountName: string
  firstImageUrl: string | null
}

export function PlatformPreview({
  content,
  platforms,
  accountHandle,
  accountName,
  firstImageUrl,
}: PlatformPreviewProps) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<PlatformKey>(platforms[0] ?? 'x')
  const current = platforms.includes(activeTab) ? activeTab : platforms[0]!

  if (platforms.length === 0) {
    return (
      <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
        {t('compose.noPreview')}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {t('compose.previewDescription')}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {platforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setActiveTab(p)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs',
              current === p
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            )}
          >
            <PlatformIcon platform={p} size={14} />
            {PLATFORMS[p].label}
          </button>
        ))}
      </div>
      <CharLimitNote platform={current} content={content} />
      <div className="max-h-[150px] overflow-y-auto">
        {current === 'x' && (
          <XMock
            content={content}
            accountName={accountName}
            accountHandle={accountHandle}
            firstImageUrl={firstImageUrl}
          />
        )}
        {current === 'bluesky' && (
          <BlueskyMock
            content={content}
            accountName={accountName}
            accountHandle={accountHandle}
            firstImageUrl={firstImageUrl}
          />
        )}
        {current === 'mastodon' && (
          <MastodonMock
            content={content}
            accountName={accountName}
            accountHandle={accountHandle}
            firstImageUrl={firstImageUrl}
          />
        )}
        {current === 'linkedin' && (
          <LinkedInMock
            content={content}
            accountName={accountName}
            firstImageUrl={firstImageUrl}
          />
        )}
        {current === 'facebook' && (
          <FacebookMock
            content={content}
            accountName={accountName}
            firstImageUrl={firstImageUrl}
          />
        )}
        {current === 'instagram' && (
          <InstagramMock
            content={content}
            accountHandle={accountHandle}
            firstImageUrl={firstImageUrl}
          />
        )}
        {!['x', 'bluesky', 'mastodon', 'linkedin', 'facebook', 'instagram'].includes(current) && (
          <FallbackMock
            platform={current}
            content={content}
            accountName={accountName}
            accountHandle={accountHandle}
            firstImageUrl={firstImageUrl}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CharLimitNote({ platform, content }: { platform: PlatformKey; content: string }) {
  const t = useT()
  const limit = PLATFORMS[platform].textLimit
  const len = content.length
  if (len <= limit) return null
  return (
    <div className="text-xs text-red-600 dark:text-red-400">
      {t('compose.charLimit', { count: len - limit, limit })}
    </div>
  )
}

function AvatarCircle({ name }: { name: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function ImagePlaceholder() {
  return (
    <div className="mt-2 h-24 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs text-neutral-400 dark:text-neutral-500">
      Image
    </div>
  )
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text
  return text.slice(0, limit) + '\u2026'
}

// ---------------------------------------------------------------------------
// Platform mocks
// ---------------------------------------------------------------------------

function XMock({
  content,
  accountName,
  accountHandle,
  firstImageUrl,
}: {
  content: string
  accountName: string
  accountHandle: string
  firstImageUrl: string | null
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
      <div className="flex gap-2">
        <AvatarCircle name={accountName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">{accountName}</span>
            <span className="text-neutral-500 dark:text-neutral-400 truncate">@{accountHandle}</span>
            <span className="text-neutral-400 dark:text-neutral-500">&middot; now</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-900 dark:text-neutral-100 leading-snug">
            {truncate(content, 280)}
          </p>
          {firstImageUrl && <ImagePlaceholder />}
          <div className="mt-2 flex items-center gap-6 text-neutral-400 dark:text-neutral-500">
            <MessageCircle className="h-3.5 w-3.5" />
            <Repeat2 className="h-3.5 w-3.5" />
            <Heart className="h-3.5 w-3.5" />
            <Eye className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  )
}

function BlueskyMock({
  content,
  accountName,
  accountHandle,
  firstImageUrl,
}: {
  content: string
  accountName: string
  accountHandle: string
  firstImageUrl: string | null
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
      <div className="flex gap-2">
        <AvatarCircle name={accountName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">{accountName}</span>
            <span className="text-neutral-500 dark:text-neutral-400 truncate">@{accountHandle}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-900 dark:text-neutral-100 leading-snug">
            {truncate(content, 300)}
          </p>
          {firstImageUrl && <ImagePlaceholder />}
          <div className="mt-2 flex items-center gap-6 text-neutral-400 dark:text-neutral-500">
            <MessageCircle className="h-3.5 w-3.5" />
            <Repeat2 className="h-3.5 w-3.5" />
            <Heart className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  )
}

function MastodonMock({
  content,
  accountName,
  accountHandle,
  firstImageUrl,
}: {
  content: string
  accountName: string
  accountHandle: string
  firstImageUrl: string | null
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
      <div className="flex gap-2">
        <AvatarCircle name={accountName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">{accountName}</span>
            <span className="text-neutral-500 dark:text-neutral-400 truncate">@{accountHandle}@instance</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-900 dark:text-neutral-100 leading-snug">
            {truncate(content, 500)}
          </p>
          {firstImageUrl && <ImagePlaceholder />}
          <div className="mt-2 flex items-center gap-6 text-neutral-400 dark:text-neutral-500">
            <MessageCircle className="h-3.5 w-3.5" />
            <Repeat2 className="h-3.5 w-3.5" />
            <Heart className="h-3.5 w-3.5" />
            <Globe className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  )
}

function LinkedInMock({
  content,
  accountName,
  firstImageUrl,
}: {
  content: string
  accountName: string
  firstImageUrl: string | null
}) {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
      <div className="flex gap-2">
        <AvatarCircle name={accountName} />
        <div>
          <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
            {accountName} <span className="font-normal text-neutral-500 dark:text-neutral-400">&middot; 1st</span>
          </div>
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Just now</div>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-900 dark:text-neutral-100 leading-snug">
        {content}
      </p>
      {firstImageUrl && <ImagePlaceholder />}
      <div className="mt-2 flex items-center gap-4 border-t border-neutral-100 dark:border-neutral-800 pt-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Like</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> Comment</span>
        <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" /> Repost</span>
        <span className="flex items-center gap-1"><Send className="h-3 w-3" /> Send</span>
      </div>
    </div>
  )
}

function FacebookMock({
  content,
  accountName,
  firstImageUrl,
}: {
  content: string
  accountName: string
  firstImageUrl: string | null
}) {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
      <div className="flex gap-2">
        <AvatarCircle name={accountName} />
        <div>
          <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">{accountName}</div>
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Just now &middot; Public</div>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-900 dark:text-neutral-100 leading-snug">
        {content}
      </p>
      {firstImageUrl && <ImagePlaceholder />}
      <div className="mt-2 flex items-center gap-4 border-t border-neutral-100 dark:border-neutral-800 pt-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Like</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> Comment</span>
        <span className="flex items-center gap-1"><Share2 className="h-3 w-3" /> Share</span>
      </div>
    </div>
  )
}

function InstagramMock({
  content,
  accountHandle,
  firstImageUrl,
}: {
  content: string
  accountHandle: string
  firstImageUrl: string | null
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
        <AvatarCircle name={accountHandle} />
        <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">{accountHandle}</span>
      </div>
      <div className="aspect-square w-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs text-neutral-400 dark:text-neutral-500 max-h-24">
        {firstImageUrl ? 'Image' : 'Image required'}
      </div>
      <div className="flex items-center gap-4 px-3 py-2 text-neutral-900 dark:text-neutral-100">
        <Heart className="h-4 w-4" />
        <MessageCircle className="h-4 w-4" />
        <Share2 className="h-4 w-4" />
        <Bookmark className="ml-auto h-4 w-4" />
      </div>
      <div className="px-3 pb-2 text-xs">
        <span className="font-semibold text-neutral-900 dark:text-neutral-100">@{accountHandle}</span>{' '}
        <span className="text-neutral-700 dark:text-neutral-200">{truncate(content, 150)}</span>
      </div>
    </div>
  )
}

function FallbackMock({
  platform,
  content,
  accountName,
  accountHandle,
  firstImageUrl,
}: {
  platform: PlatformKey
  content: string
  accountName: string
  accountHandle: string
  firstImageUrl: string | null
}) {
  const p = PLATFORMS[platform]
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: p.color }}>
        {p.label}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <AvatarCircle name={accountName} />
          <div>
            <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">{accountName}</div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">@{accountHandle}</div>
          </div>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-900 dark:text-neutral-100 leading-snug">
          {truncate(content, p.textLimit)}
        </p>
        {firstImageUrl && <ImagePlaceholder />}
      </div>
    </div>
  )
}
