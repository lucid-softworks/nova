import { useEffect, useRef } from 'react'
import { toast } from '~/components/ui/toast'
import { listMyNotifications } from '~/server/notifications'

const ADMIN_TYPES = new Set(['admin_user_signup', 'admin_workspace_upgraded'])
const POLL_MS = 20_000

/**
 * Poll /api/notifications for admin-targeted events (new signups, new
 * paid subscriptions) and pop a sonner toast once per newly-seen event.
 *
 * This component renders nothing — it only manages the effect. Mount it
 * in the dashboard layout when the session user's role is 'admin'.
 */
export function AdminEventToasts() {
  // Track the IDs we've already toasted so a second poll doesn't
  // redeliver. Seeded on first poll with everything currently unread so
  // a fresh page load doesn't dump a week of signups into the UI.
  const seenIds = useRef<Set<string>>(new Set())
  const seeded = useRef(false)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const rows = await listMyNotifications()
        if (cancelled) return
        const admin = rows.filter((r) => ADMIN_TYPES.has(r.type))
        if (!seeded.current) {
          for (const r of admin) seenIds.current.add(r.id)
          seeded.current = true
          return
        }
        // Iterate oldest-first so toasts stack in natural order.
        const fresh = admin.filter((r) => !seenIds.current.has(r.id)).reverse()
        for (const r of fresh) {
          seenIds.current.add(r.id)
          if (r.type === 'admin_user_signup') {
            toast.success(r.title, { description: r.body })
          } else {
            toast.info(r.title, { description: r.body })
          }
        }
      } catch {
        // Transient poll failures — silently retry next tick.
      }
    }
    void tick()
    const handle = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(handle)
    }
  }, [])

  return null
}
