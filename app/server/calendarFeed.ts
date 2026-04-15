import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  ensureCalendarFeedTokenImpl,
  regenerateCalendarFeedTokenImpl,
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
