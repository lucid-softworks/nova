import { PLATFORMS, type PlatformKey } from '~/lib/platforms'

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}
export function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0 = Sun
  const mondayOffset = (day + 6) % 7 // days since Monday
  const out = new Date(d)
  out.setDate(out.getDate() - mondayOffset)
  out.setHours(0, 0, 0, 0)
  return out
}
export function endOfWeek(d: Date): Date {
  const s = startOfWeek(d)
  const out = new Date(s)
  out.setDate(out.getDate() + 6)
  out.setHours(23, 59, 59, 999)
  return out
}
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
export function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export type PillStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'pending_approval'

export const STATUS_DOT: Record<PillStatus, string> = {
  draft: 'bg-neutral-400',
  scheduled: 'bg-blue-500',
  publishing: 'bg-indigo-500',
  published: 'bg-green-500',
  failed: 'bg-red-500',
  pending_approval: 'bg-yellow-500',
}

export function platformColorOrFallback(platform: PlatformKey | null | undefined): string {
  return platform ? PLATFORMS[platform].color : '#6366f1'
}

// Month grid returns exactly 6 weeks of days starting on the Monday
// containing or before the 1st of the month.
export function monthGrid(d: Date): Date[] {
  const first = startOfMonth(d)
  const gridStart = startOfWeek(first)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart)
    day.setDate(day.getDate() + i)
    days.push(day)
  }
  return days
}
