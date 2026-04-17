import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  listAccountsImpl,
  listAvailablePlatformsImpl,
  disconnectAccountImpl,
  connectBlueskyImpl,
  startOAuthImpl,
  startMastodonOAuthImpl,
  type AccountSummary,
} from './accounts.server'

export type { AccountSummary }

const workspaceInput = z.object({ workspaceSlug: z.string().min(1) })

export const listAccounts = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => workspaceInput.parse(d))
  .handler(async ({ data }) => listAccountsImpl(data.workspaceSlug))

export const listAvailablePlatforms = createServerFn({ method: 'GET' })
  .handler(async () => listAvailablePlatformsImpl())

const disconnectInput = z.object({
  workspaceSlug: z.string().min(1),
  accountId: z.string().uuid(),
})

export const disconnectAccount = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => disconnectInput.parse(d))
  .handler(async ({ data }) => disconnectAccountImpl(data.workspaceSlug, data.accountId))

const blueskyInput = z.object({
  workspaceSlug: z.string().min(1),
  identifier: z.string().min(1),
  password: z.string().min(1),
})

export const connectBluesky = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => blueskyInput.parse(d))
  .handler(async ({ data }) =>
    connectBlueskyImpl(data.workspaceSlug, data.identifier, data.password),
  )

const startOAuthSchema = z.object({
  workspaceSlug: z.string().min(1),
  platform: z.enum([
    'facebook',
    'instagram',
    'threads',
    'x',
    'linkedin',
    'youtube',
    'tiktok',
    'pinterest',
    'tumblr',
    'reddit',
  ]),
})

export const startOAuth = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => startOAuthSchema.parse(d))
  .handler(async ({ data }) => startOAuthImpl(data.workspaceSlug, data.platform))

const mastodonInput = z.object({
  workspaceSlug: z.string().min(1),
  instance: z.string().min(1),
})

export const connectMastodon = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => mastodonInput.parse(d))
  .handler(async ({ data }) => startMastodonOAuthImpl(data.workspaceSlug, data.instance))
