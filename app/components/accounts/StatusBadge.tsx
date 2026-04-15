import { cn } from '~/lib/utils'

type Status = 'connected' | 'disconnected' | 'expired'

const LABELS: Record<Status, string> = {
  connected: 'Connected',
  expired: 'Expired',
  disconnected: 'Disconnected',
}

const STYLES: Record<Status, { bg: string; text: string; dot: string }> = {
  connected: { bg: 'bg-green-50 dark:bg-green-950/40', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  expired: { bg: 'bg-yellow-50 dark:bg-yellow-950/40', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  disconnected: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
}

export function StatusBadge({ status }: { status: Status }) {
  const s = STYLES[status]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', s.bg, s.text)}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {LABELS[status]}
    </span>
  )
}
