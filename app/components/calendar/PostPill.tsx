import { useDraggable } from '@dnd-kit/core'
import { Repeat2, Target } from 'lucide-react'
import type { PostRow } from '~/server/posts'
import { PLATFORMS } from '~/lib/platforms'
import { fmtTime, platformColorOrFallback, STATUS_DOT } from './helpers'
import { cn } from '~/lib/utils'

export function PostPill({
  post,
  onClick,
  compact,
  draggable = true,
}: {
  post: PostRow
  onClick: () => void
  compact?: boolean
  draggable?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    disabled: !draggable,
  })

  const time = post.publishedAt ?? post.scheduledAt ?? post.createdAt
  const firstPlatform = post.platforms[0]?.platform ?? null
  const borderColor = platformColorOrFallback(firstPlatform)
  const preview =
    post.type === 'reshare'
      ? post.reshareSource
        ? `${post.reshareSource.authorHandle}: ${post.reshareSource.preview}`
        : 'Reshare'
      : post.defaultContent || 'Untitled'

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      style={{
        borderLeftColor: borderColor,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      {...listeners}
      {...attributes}
      className={cn(
        'flex w-full items-center gap-1 overflow-hidden rounded border border-l-4 border-neutral-200 bg-white px-1.5 py-0.5 text-left text-[11px] leading-tight hover:bg-neutral-50',
        isDragging && 'opacity-40',
        compact && 'py-[1px]',
      )}
      title={`${PLATFORMS[firstPlatform ?? 'x'].label} · ${fmtTime(time)} · ${post.status}`}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[post.status])} />
      {post.campaignId ? (
        <Target className="h-2.5 w-2.5 shrink-0 text-indigo-500" />
      ) : post.type === 'reshare' ? (
        <Repeat2 className="h-2.5 w-2.5 shrink-0 text-purple-600" />
      ) : null}
      <span className="truncate flex-1 text-neutral-900">
        {post.campaignId && post.campaignName ? <span className="font-medium">{post.campaignName} · </span> : null}
        {preview}
      </span>
      <span className="shrink-0 text-neutral-500">{fmtTime(time)}</span>
    </button>
  )
}
