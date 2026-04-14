import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  listMyNotificationsImpl,
  unreadCountImpl,
  markReadImpl,
  markAllReadImpl,
  type NotificationRow,
  type NotificationType,
} from './notifications.server'

export type { NotificationRow, NotificationType }

export const listMyNotifications = createServerFn({ method: 'GET' }).handler(async () =>
  listMyNotificationsImpl(),
)

export const unreadCount = createServerFn({ method: 'GET' }).handler(async () =>
  unreadCountImpl(),
)

const markReadSchema = z.object({ ids: z.array(z.string().uuid()) })

export const markNotificationsRead = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => markReadSchema.parse(d))
  .handler(async ({ data }) => markReadImpl(data.ids))

export const markAllNotificationsRead = createServerFn({ method: 'POST' }).handler(async () =>
  markAllReadImpl(),
)
