import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  listContentSeriesImpl,
  createContentSeriesImpl,
  deleteContentSeriesImpl,
  applyContentSeriesImpl,
  type ContentSeriesRow,
  type ContentSeriesSlot,
} from './contentSeries.server'

export type { ContentSeriesRow, ContentSeriesSlot }

const wsOnly = z.object({ workspaceSlug: z.string().min(1) })

export const listContentSeries = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => listContentSeriesImpl(data.workspaceSlug))

const slotSchema = z.object({
  dayOffset: z.number().int().min(0),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
  contentHint: z.string().min(1).max(500),
  platforms: z.array(z.string()),
})

const createSchema = z.object({
  workspaceSlug: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  slots: z.array(slotSchema).min(1).max(100),
})

export const createContentSeries = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data }) =>
    createContentSeriesImpl(data.workspaceSlug, {
      name: data.name,
      description: data.description ?? null,
      slots: data.slots,
    }),
  )

const deleteSchema = z.object({
  workspaceSlug: z.string().min(1),
  seriesId: z.string().min(1),
})

export const deleteContentSeries = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data }) => deleteContentSeriesImpl(data.workspaceSlug, data.seriesId))

const useSchema = z.object({
  workspaceSlug: z.string().min(1),
  seriesId: z.string().min(1),
  startDate: z.string().min(1),
})

export const applyContentSeries = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => useSchema.parse(d))
  .handler(async ({ data }) =>
    applyContentSeriesImpl(data.workspaceSlug, data.seriesId, data.startDate),
  )
