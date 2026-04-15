import { Worker } from 'bullmq'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { decrypt } from '~/lib/encryption'
import { getRedis } from './connection'
import { adapters } from '~/server/analyticsAdapters'
import {
  markAccountExpired,
  markAccountSynced,
  upsertAccountSnapshot,
  upsertPostSnapshots,
} from '~/server/analyticsAdapters/persist'
import type { AnalyticsAccountCtx } from '~/server/analyticsAdapters'
import type { AnalyticsJobData } from './analyticsQueue'

let worker: Worker<AnalyticsJobData> | null = null

function isAuthExpired(err: unknown): boolean {
  if (!err) return false
  const message = err instanceof Error ? err.message : String(err)
  return /AUTH_EXPIRED/i.test(message)
}

function safeDecrypt(v: string | null): string {
  if (!v) return ''
  try {
    return decrypt(v)
  } catch {
    return ''
  }
}

async function syncOne(account: {
  id: string
  platform: keyof typeof adapters
  accountName: string
  accountHandle: string
  workspaceId: string
  accessToken: string
  refreshToken: string | null
  metadata: unknown
}, date: string): Promise<void> {
  const adapter = adapters[account.platform]
  if (!adapter) return

  const platformPostRows = await db
    .select({ platformPostId: schema.postPlatforms.platformPostId })
    .from(schema.postPlatforms)
    .where(eq(schema.postPlatforms.socialAccountId, account.id))
  const platformPostIds = platformPostRows
    .map((r) => r.platformPostId)
    .filter((v): v is string => !!v)

  const ctx: AnalyticsAccountCtx = {
    id: account.id,
    platform: account.platform,
    accountName: account.accountName,
    accountHandle: account.accountHandle,
    workspaceId: account.workspaceId,
    accessToken: safeDecrypt(account.accessToken),
    refreshToken: safeDecrypt(account.refreshToken),
    metadata: (account.metadata ?? {}) as Record<string, unknown>,
    platformPostIds,
  }

  try {
    const snap = await adapter.syncAccount(ctx)
    await upsertAccountSnapshot(account.id, date, snap)
    if (adapter.syncPosts) {
      const posts = await adapter.syncPosts(ctx)
      await upsertPostSnapshots(account.id, date, posts)
    }
    await markAccountSynced(account.id)
  } catch (err) {
    if (isAuthExpired(err)) {
      await markAccountExpired(account.id)
      console.warn(`[analytics] ${account.platform}:${account.id} marked expired`)
      return
    }
    throw err
  }
}

export function getAnalyticsWorker(): Worker<AnalyticsJobData> {
  if (worker) return worker
  worker = new Worker<AnalyticsJobData>(
    'analytics',
    async (job) => {
      const { date, workspaceId, socialAccountId } = job.data
      const filters = [eq(schema.socialAccounts.status, 'connected')]
      if (workspaceId) filters.push(eq(schema.socialAccounts.workspaceId, workspaceId))
      if (socialAccountId) filters.push(eq(schema.socialAccounts.id, socialAccountId))
      const accounts = await db
        .select({
          id: schema.socialAccounts.id,
          platform: schema.socialAccounts.platform,
          accountName: schema.socialAccounts.accountName,
          accountHandle: schema.socialAccounts.accountHandle,
          workspaceId: schema.socialAccounts.workspaceId,
          accessToken: schema.socialAccounts.accessToken,
          refreshToken: schema.socialAccounts.refreshToken,
          metadata: schema.socialAccounts.metadata,
        })
        .from(schema.socialAccounts)
        .where(and(...filters))

      for (const a of accounts) {
        try {
          await syncOne(
            {
              id: a.id,
              platform: a.platform as keyof typeof adapters,
              accountName: a.accountName,
              accountHandle: a.accountHandle,
              workspaceId: a.workspaceId,
              accessToken: a.accessToken,
              refreshToken: a.refreshToken,
              metadata: a.metadata,
            },
            date,
          )
        } catch (err) {
          console.error(`[analytics] ${a.platform}:${a.id} failed`, err)
        }
        // Stagger so we don't blast every platform in one hot second.
        await new Promise((r) => setTimeout(r, 250))
      }
    },
    { connection: getRedis(), concurrency: 1 },
  )
  return worker
}

export function resetAnalyticsWorker() {
  worker = null
}
