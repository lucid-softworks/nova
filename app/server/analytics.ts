import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  getSummaryImpl,
  getFollowerSeriesImpl,
  getDailyEngagementsImpl,
  getPlatformTableImpl,
  getTopPostsImpl,
  getBestPostingTimesImpl,
  listAccountsForAnalyticsImpl,
  type AnalyticsSummary,
  type FollowerPoint,
  type DailyEngagementRow,
  type PlatformTableRow,
  type TopPostRow,
  type HeatmapRow,
  type AccountOption,
  type AnalyticsRange,
  type CustomRange,
} from './analytics.server'

export type {
  AnalyticsSummary,
  FollowerPoint,
  DailyEngagementRow,
  PlatformTableRow,
  TopPostRow,
  HeatmapRow,
  AccountOption,
  AnalyticsRange,
  CustomRange,
}

const rangeEnum = z.enum(['7d', '30d', '90d', 'custom'])

// Shared range extractor — accepts fromIso/toIso when range === 'custom',
// ignores them otherwise.
const customFields = {
  fromIso: z.string().datetime().nullable().optional(),
  toIso: z.string().datetime().nullable().optional(),
}

function pickCustom(data: {
  range: AnalyticsRange
  fromIso?: string | null
  toIso?: string | null
}): CustomRange {
  if (data.range !== 'custom') return null
  if (!data.fromIso || !data.toIso) return null
  return { fromIso: data.fromIso, toIso: data.toIso }
}

const baseSchema = z.object({
  workspaceSlug: z.string().min(1),
  range: rangeEnum,
  accountId: z.string().uuid().nullable(),
  ...customFields,
})

const tableSchema = z.object({
  workspaceSlug: z.string().min(1),
  range: rangeEnum,
  ...customFields,
})

export const getSummary = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => baseSchema.parse(d))
  .handler(async ({ data }) =>
    getSummaryImpl(data.workspaceSlug, data.range, data.accountId, pickCustom(data)),
  )

export const getFollowerSeries = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => baseSchema.parse(d))
  .handler(async ({ data }) =>
    getFollowerSeriesImpl(data.workspaceSlug, data.range, data.accountId, pickCustom(data)),
  )

export const getDailyEngagements = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => baseSchema.parse(d))
  .handler(async ({ data }) =>
    getDailyEngagementsImpl(data.workspaceSlug, data.range, data.accountId, pickCustom(data)),
  )

export const getPlatformTable = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => tableSchema.parse(d))
  .handler(async ({ data }) =>
    getPlatformTableImpl(data.workspaceSlug, data.range, pickCustom(data)),
  )

export const getTopPosts = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => tableSchema.parse(d))
  .handler(async ({ data }) =>
    getTopPostsImpl(data.workspaceSlug, data.range, pickCustom(data)),
  )

export const getBestPostingTimes = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => tableSchema.parse(d))
  .handler(async ({ data }) =>
    getBestPostingTimesImpl(data.workspaceSlug, data.range, pickCustom(data)),
  )

export const listAccountsForAnalytics = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) =>
    z.object({ workspaceSlug: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => listAccountsForAnalyticsImpl(data.workspaceSlug))
