import { cn } from '~/lib/utils'
import type { PostStatus, CampaignStatus } from '~/server/posts'

const POST_STATUS_STYLES: Record<PostStatus, { label: string; bg: string; text: string; dot: string }> = {
  draft: { label: 'Draft', bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-400' },
  scheduled: { label: 'Scheduled', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  publishing: { label: 'Publishing', bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  published: { label: 'Published', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  failed: { label: 'Failed', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  pending_approval: { label: 'Pending', bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
}

const CAMPAIGN_STATUS_STYLES: Record<CampaignStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-neutral-100', text: 'text-neutral-700' },
  scheduled: { label: 'Scheduled', bg: 'bg-blue-50', text: 'text-blue-700' },
  publishing: { label: 'Publishing', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  published: { label: 'Published', bg: 'bg-green-50', text: 'text-green-700' },
  failed: { label: 'Failed', bg: 'bg-red-50', text: 'text-red-700' },
  partial: { label: 'Partial', bg: 'bg-amber-50', text: 'text-amber-700' },
  on_hold: { label: 'On Hold', bg: 'bg-yellow-50', text: 'text-yellow-800' },
  paused: { label: 'Paused', bg: 'bg-neutral-100', text: 'text-neutral-700' },
  cancelled: { label: 'Cancelled', bg: 'bg-neutral-200', text: 'text-neutral-600' },
}

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const s = POST_STATUS_STYLES[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', s.bg, s.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = CAMPAIGN_STATUS_STYLES[status]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', s.bg, s.text)}>
      {s.label}
    </span>
  )
}

export function PostTypeBadge({ type }: { type: 'original' | 'reshare' }) {
  if (type === 'original') return null
  return (
    <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-700">
      ↻ Reshare
    </span>
  )
}
