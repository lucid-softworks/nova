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
}

const rangeEnum = z.enum(['7d', '30d', '90d'])

const baseSchema = z.object({
  workspaceSlug: z.string().min(1),
  range: rangeEnum,
  accountId: z.string().uuid().nullable(),
})

const tableSchema = z.object({ workspaceSlug: z.string().min(1), range: rangeEnum })

export const getSummary = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => baseSchema.parse(d))
  .handler(async ({ data }) => getSummaryImpl(data.workspaceSlug, data.range, data.accountId))

export const getFollowerSeries = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => baseSchema.parse(d))
  .handler(async ({ data }) =>
    getFollowerSeriesImpl(data.workspaceSlug, data.range, data.accountId),
  )

export const getDailyEngagements = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => baseSchema.parse(d))
  .handler(async ({ data }) =>
    getDailyEngagementsImpl(data.workspaceSlug, data.range, data.accountId),
  )

export const getPlatformTable = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => tableSchema.parse(d))
  .handler(async ({ data }) => getPlatformTableImpl(data.workspaceSlug, data.range))

export const getTopPosts = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => tableSchema.parse(d))
  .handler(async ({ data }) => getTopPostsImpl(data.workspaceSlug, data.range))

export const getBestPostingTimes = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => tableSchema.parse(d))
  .handler(async ({ data }) => getBestPostingTimesImpl(data.workspaceSlug, data.range))

export const listAccountsForAnalytics = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) =>
    z.object({ workspaceSlug: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => listAccountsForAnalyticsImpl(data.workspaceSlug))
