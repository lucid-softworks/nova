import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { backfillBlueskyImpl, type BackfillResult } from './backfill/bluesky'

export type { BackfillResult }

const input = z.object({
  workspaceSlug: z.string().min(1),
  socialAccountId: z.string().uuid(),
  maxPages: z.number().int().min(1).max(20).default(5),
})

export const backfillBluesky = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) =>
    backfillBlueskyImpl(data.workspaceSlug, data.socialAccountId, data.maxPages),
  )
