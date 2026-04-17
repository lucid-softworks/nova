import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  listWatchesImpl,
  createWatchImpl,
  toggleWatchImpl,
  deleteWatchImpl,
  listMatchesImpl,
  markMatchReadImpl,
  markAllMatchesReadImpl,
  type KeywordWatchRow,
  type KeywordMatchRow,
} from './monitors.server'

export type { KeywordWatchRow, KeywordMatchRow }

const slug = z.object({ workspaceSlug: z.string().min(1) })

export const listMonitorWatches = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => slug.parse(d))
  .handler(async ({ data }) => listWatchesImpl(data.workspaceSlug))

const createSchema = z.object({
  workspaceSlug: z.string().min(1),
  term: z.string().min(1).max(200),
  platform: z.enum(['bluesky']).default('bluesky'),
})

export const createMonitorWatch = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data }) =>
    createWatchImpl(data.workspaceSlug, data.term, data.platform),
  )

const toggleSchema = z.object({
  workspaceSlug: z.string().min(1),
  watchId: z.string().uuid(),
  enabled: z.boolean(),
})

export const toggleMonitorWatch = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => toggleSchema.parse(d))
  .handler(async ({ data }) => toggleWatchImpl(data.workspaceSlug, data.watchId, data.enabled))

const deleteSchema = z.object({
  workspaceSlug: z.string().min(1),
  watchId: z.string().uuid(),
})

export const deleteMonitorWatch = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data }) => deleteWatchImpl(data.workspaceSlug, data.watchId))

const listMatchesSchema = z.object({
  workspaceSlug: z.string().min(1),
  watchId: z.string().uuid().optional(),
  unreadOnly: z.boolean().optional(),
})

export const listMonitorMatches = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => listMatchesSchema.parse(d))
  .handler(async ({ data }) =>
    listMatchesImpl(data.workspaceSlug, {
      watchId: data.watchId,
      unreadOnly: data.unreadOnly,
    }),
  )

const markReadSchema = z.object({
  workspaceSlug: z.string().min(1),
  matchId: z.string().uuid(),
})

export const markMonitorMatchRead = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => markReadSchema.parse(d))
  .handler(async ({ data }) => markMatchReadImpl(data.workspaceSlug, data.matchId))

const markAllSchema = z.object({
  workspaceSlug: z.string().min(1),
  watchId: z.string().uuid().optional(),
})

export const markAllMonitorMatchesRead = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => markAllSchema.parse(d))
  .handler(async ({ data }) => markAllMatchesReadImpl(data.workspaceSlug, data.watchId))
