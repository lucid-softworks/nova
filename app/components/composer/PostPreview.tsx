import { Heart, MessageCircle, Repeat2, Share2, ArrowUpFromLine, ThumbsUp, Smile } from 'lucide-react'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { cn } from '~/lib/utils'
import type { ConnectedAccount, MediaAsset, Version } from './types'

export function PostPreview({
  version,
  account,
  platform,
  mediaById,
  redditTitle,
  subreddit,
}: {
  version: Version
  account: ConnectedAccount | null
  platform: PlatformKey
  mediaById: Record<string, MediaAsset>
  redditTitle?: string
  subreddit?: string
}) {
  const media = version.mediaIds.map((id) => mediaById[id]).filter(Boolean) as MediaAsset[]
  const text = version.isThread
    ? version.threadParts.map((p) => p.content).filter(Boolean).join('\n\n—\n\n')
    : version.content
  const handle = account?.accountHandle ?? 'you'
  const name = account?.accountName ?? 'Your Account'
  const avatar = account?.avatarUrl

  switch (platform) {
    case 'x':
      return (
        <XPreview name={name} handle={handle} avatar={avatar} text={text} media={media} />
      )
    case 'instagram':
      return <InstagramPreview name={name} handle={handle} avatar={avatar} text={text} media={media} />
    case 'linkedin':
      return <LinkedInPreview name={name} text={text} media={media} avatar={avatar} />
    case 'facebook':
      return <FacebookPreview name={name} avatar={avatar} text={text} media={media} />
    case 'reddit':
      return (
        <RedditPreview
          subreddit={subreddit || 'r/yourSub'}
          title={redditTitle || 'Post title'}
          text={text}
          media={media}
          handle={handle}
        />
      )
    default:
      return (
        <GenericPreview
          platform={platform}
          name={name}
          handle={handle}
          avatar={avatar}
          text={text}
          media={media}
        />
      )
  }
}

function Avatar({ url, fallback, size = 40 }: { url: string | null | undefined; fallback: string; size?: number }) {
  if (url) return <img src={url} alt="" className="rounded-full" style={{ width: size, height: size }} />
  return (
    <div
      className="flex items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-600"
      style={{ width: size, height: size }}
    >
      {fallback.charAt(0).toUpperCase()}
    </div>
  )
}

function MediaGrid({ media }: { media: MediaAsset[] }) {
  if (media.length === 0) return null
  return (
    <div className="mt-3 grid grid-cols-2 gap-1 overflow-hidden rounded-md">
      {media.slice(0, 4).map((m) =>
        m.mimeType.startsWith('video/') ? (
          <video key={m.id} src={m.url} className="aspect-square h-full w-full object-cover" controls />
        ) : (
          <img
            key={m.id}
            src={m.url}
            alt=""
            className={cn('aspect-square h-full w-full object-cover', media.length === 1 && 'col-span-2 aspect-video')}
          />
        ),
      )}
    </div>
  )
}

function XPreview({
  name,
  handle,
  avatar,
  text,
  media,
}: {
  name: string
  handle: string
  avatar?: string | null
  text: string
  media: MediaAsset[]
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex gap-3">
        <Avatar url={avatar} fallback={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-neutral-900">{name}</span>
            <span className="text-neutral-500">@{handle}</span>
          </div>
          <div className="mt-1 whitespace-pre-wrap text-[15px] text-neutral-900">{text}</div>
          <MediaGrid media={media} />
          <div className="mt-3 flex items-center gap-8 text-xs text-neutral-500">
            <MessageCircle className="h-4 w-4" />
            <Repeat2 className="h-4 w-4" />
            <Heart className="h-4 w-4" />
            <Share2 className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

function InstagramPreview({
  name,
  handle,
  avatar,
  text,
  media,
}: {
  name: string
  handle: string
  avatar?: string | null
  text: string
  media: MediaAsset[]
}) {
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[32px] border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-neutral-100 p-3">
        <Avatar url={avatar} fallback={handle} size={32} />
        <div className="text-sm font-semibold">{handle}</div>
      </div>
      <div className="aspect-square w-full bg-neutral-100">
        {media[0]?.mimeType.startsWith('video/') ? (
          <video src={media[0].url} className="h-full w-full object-cover" controls />
        ) : media[0] ? (
          <img src={media[0].url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            Image placeholder
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 p-3">
        <Heart className="h-5 w-5" />
        <MessageCircle className="h-5 w-5" />
        <Share2 className="h-5 w-5" />
      </div>
      <div className="space-y-1 px-3 pb-4 text-sm">
        <div>
          <span className="font-semibold">{handle}</span>{' '}
          <span className="whitespace-pre-wrap text-neutral-800">
            {text.replace(/#(\w+)/g, (m) => m).split(/(#\w+)/g).map((chunk, i) =>
              chunk.startsWith('#') ? (
                <span key={i} className="text-blue-600">
                  {chunk}
                </span>
              ) : (
                <span key={i}>{chunk}</span>
              ),
            )}
          </span>
        </div>
        <div className="text-xs text-neutral-500">{name}</div>
      </div>
    </div>
  )
}

function LinkedInPreview({
  name,
  text,
  media,
  avatar,
}: {
  name: string
  text: string
  media: MediaAsset[]
  avatar?: string | null
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="flex gap-3">
        <Avatar url={avatar} fallback={name} />
        <div className="flex-1">
          <div className="text-sm font-semibold text-neutral-900">
            {name} <span className="text-xs font-normal text-neutral-500">· 1st</span>
          </div>
          <div className="text-xs text-neutral-500">Just now · 🌐</div>
        </div>
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-900">{text}</div>
      <MediaGrid media={media} />
      <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
        <ThumbsUp className="h-4 w-4" /> Like
        <MessageCircle className="h-4 w-4" /> Comment
        <Share2 className="h-4 w-4" /> Share
      </div>
    </div>
  )
}

function FacebookPreview({
  name,
  avatar,
  text,
  media,
}: {
  name: string
  avatar?: string | null
  text: string
  media: MediaAsset[]
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="flex gap-3">
        <Avatar url={avatar} fallback={name} />
        <div>
          <div className="text-sm font-semibold text-neutral-900">{name}</div>
          <div className="text-xs text-neutral-500">Just now · 🌐</div>
        </div>
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-900">{text}</div>
      <MediaGrid media={media} />
      <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
        <ThumbsUp className="h-4 w-4" /> Like
        <MessageCircle className="h-4 w-4" /> Comment
        <Share2 className="h-4 w-4" /> Share
      </div>
    </div>
  )
}

function RedditPreview({
  subreddit,
  title,
  text,
  media,
  handle,
}: {
  subreddit: string
  title: string
  text: string
  media: MediaAsset[]
  handle: string
}) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 text-xs text-neutral-500">
        <span className="font-semibold text-neutral-900">{subreddit.startsWith('r/') ? subreddit : `r/${subreddit}`}</span>
        <span>· Posted by u/{handle}</span>
      </div>
      <div className="flex">
        <div className="flex w-10 flex-col items-center gap-1 bg-neutral-50 py-3 text-neutral-400">
          <ArrowUpFromLine className="h-4 w-4" />
          <span className="text-xs">–</span>
          <ArrowUpFromLine className="h-4 w-4 rotate-180" />
        </div>
        <div className="flex-1 p-3">
          <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
          {text ? <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{text}</p> : null}
          <MediaGrid media={media} />
        </div>
      </div>
    </div>
  )
}

function GenericPreview({
  platform,
  name,
  handle,
  avatar,
  text,
  media,
}: {
  platform: PlatformKey
  name: string
  handle: string
  avatar?: string | null
  text: string
  media: MediaAsset[]
}) {
  const p = PLATFORMS[platform]
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div
        className="flex items-center gap-2 p-3 text-sm font-semibold text-white"
        style={{ backgroundColor: p.color }}
      >
        {p.label}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Avatar url={avatar} fallback={name} size={32} />
          <div>
            <div className="text-sm font-semibold">{name}</div>
            <div className="text-xs text-neutral-500">@{handle}</div>
          </div>
        </div>
        <div className="mt-2 whitespace-pre-wrap text-sm text-neutral-900">{text}</div>
        <MediaGrid media={media} />
        <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
          <Smile className="h-4 w-4" />
          <MessageCircle className="h-4 w-4" />
          <Share2 className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}
