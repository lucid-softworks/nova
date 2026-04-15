import { and, eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { decrypt } from '~/lib/encryption'
import { logger } from '~/lib/logger'
import * as bluesky from './bluesky'
import * as mastodon from './mastodon'
import type { InboxAccountCtx, InboxAdapter } from './types'

const ADAPTERS: Record<string, InboxAdapter> = { bluesky, mastodon }

function safeDecrypt(v: string | null | undefined): string {
  if (!v) return ''
  try {
    return decrypt(v)
  } catch {
    return ''
  }
}

async function resolvePostPlatformId(
  socialAccountId: string,
  referenced: string | null,
): Promise<string | null> {
  if (!referenced) return null
  const row = await db.query.postPlatforms.findFirst({
    where: and(
      eq(schema.postPlatforms.socialAccountId, socialAccountId),
      eq(schema.postPlatforms.platformPostId, referenced),
    ),
  })
  return row?.id ?? null
}

async function pollAccount(account: {
  id: string
  workspaceId: string
  platform: string
  accountHandle: string
  accessToken: string
  refreshToken: string | null
  metadata: unknown
}): Promise<number> {
  const adapter = ADAPTERS[account.platform]
  if (!adapter) return 0
  const ctx: InboxAccountCtx = {
    id: account.id,
    platform: account.platform as 'bluesky' | 'mastodon',
    accessToken: safeDecrypt(account.accessToken),
    refreshToken: safeDecrypt(account.refreshToken),
    metadata: (account.metadata ?? {}) as Record<string, unknown>,
    accountHandle: account.accountHandle,
  }
  const items = await adapter.fetchInbox(ctx)
  let inserted = 0
  for (const item of items) {
    const postPlatformId = await resolvePostPlatformId(
      account.id,
      item.referencedPlatformPostId,
    )
    try {
      await db
        .insert(schema.inboxItems)
        .values({
          workspaceId: account.workspaceId,
          socialAccountId: account.id,
          platform: account.platform,
          platformItemId: item.platformItemId,
          kind: item.kind,
          actorHandle: item.actorHandle,
          actorName: item.actorName,
          actorAvatar: item.actorAvatar,
          content: item.content,
          permalink: item.permalink,
          itemCreatedAt: item.itemCreatedAt,
          postPlatformId,
        })
        .onConflictDoNothing()
      inserted++
    } catch (e) {
      logger.warn(
        { err: e instanceof Error ? e.message : String(e), accountId: account.id },
        'inbox insert failed',
      )
    }
  }
  return inserted
}

export async function pollAllInboxes(): Promise<void> {
  const accounts = await db
    .select({
      id: schema.socialAccounts.id,
      workspaceId: schema.socialAccounts.workspaceId,
      platform: schema.socialAccounts.platform,
      accountHandle: schema.socialAccounts.accountHandle,
      accessToken: schema.socialAccounts.accessToken,
      refreshToken: schema.socialAccounts.refreshToken,
      metadata: schema.socialAccounts.metadata,
    })
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.status, 'connected'))

  for (const a of accounts) {
    if (!(a.platform in ADAPTERS)) continue
    try {
      const n = await pollAccount(a)
      if (n > 0) {
        logger.info({ accountId: a.id, platform: a.platform, inserted: n }, 'inbox polled')
      }
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e.message : String(e), accountId: a.id },
        'inbox poll failed',
      )
    }
  }
}
