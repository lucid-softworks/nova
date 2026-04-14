import { Bell } from 'lucide-react'

export function NotificationBell({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <button
      type="button"
      className="relative rounded-md p-2 hover:bg-neutral-100"
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5 text-neutral-700" />
      {unreadCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </button>
  )
}
