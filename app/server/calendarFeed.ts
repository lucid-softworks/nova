import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  ensureCalendarFeedTokenImpl,
  regenerateCalendarFeedTokenImpl,
  ensureShareCalendarTokenImpl,
  regenerateShareCalendarTokenImpl,
  revokeShareCalendarTokenImpl,
  getShareCalendarStatusImpl,
} from './calendarFeed.server'

const input = z.object({ workspaceSlug: z.string().min(1) })

export const ensureCalendarFeedToken = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const token = await ensureCalendarFeedTokenImpl(data.workspaceSlug)
    return { token, url: publicUrl(token) }
  })

export const regenerateCalendarFeedToken = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const token = await regenerateCalendarFeedTokenImpl(data.workspaceSlug)
    return { token, url: publicUrl(token) }
  })

function publicUrl(token: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/+$/, '')}/api/calendar/${token}.ics`
}

function sharePublicUrl(token: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/+$/, '')}/c/${token}`
}

export const getShareCalendarStatus = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const { token } = await getShareCalendarStatusImpl(data.workspaceSlug)
    return { token, url: token ? sharePublicUrl(token) : null }
  })

export const ensureShareCalendarToken = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const token = await ensureShareCalendarTokenImpl(data.workspaceSlug)
    return { token, url: sharePublicUrl(token) }
  })

export const regenerateShareCalendarToken = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const token = await regenerateShareCalendarTokenImpl(data.workspaceSlug)
    return { token, url: sharePublicUrl(token) }
  })

export const revokeShareCalendarToken = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    await revokeShareCalendarTokenImpl(data.workspaceSlug)
    return { ok: true as const }
  })
