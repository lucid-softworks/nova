import { and, eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { requireWorkspaceAccess } from '~/server/session.server'
import { logger } from '~/lib/logger'

const PLC_DIRECTORY = 'https://plc.directory'

type RepoRecord = {
  uri: string
  cid: string
  value: {
    text?: string
    $type?: string
    createdAt?: string
    reply?: unknown
  }
}

type ListRecordsResponse = {
  records?: RepoRecord[]
  cursor?: string
}

async function resolvePds(did: string): Promise<string> {
  const res = await fetch(`${PLC_DIRECTORY}/${encodeURIComponent(did)}`)
  if (!res.ok) throw new Error(`DID resolution failed (${res.status})`)
  const doc = (await res.json()) as {
    service?: Array<{ id: string; type: string; serviceEndpoint: string }>
  }
  const pds = doc.service?.find((s) => s.id === '#atproto_pds')
  if (!pds) throw new Error('No #atproto_pds service in DID document')
  return pds.serviceEndpoint.replace(/\/+$/, '')
}

async function resolveHandle(did: string): Promise<string> {
  const res = await fetch(`${PLC_DIRECTORY}/${encodeURIComponent(did)}`)
  if (!res.ok) return did
  const doc = (await res.json()) as { alsoKnownAs?: string[] }
  const atUri = doc.alsoKnownAs?.find((a) => a.startsWith('at://'))
  return atUri ? atUri.replace('at://', '') : did
}

function postUrl(handle: string, uri: string): string {
  const rkey = uri.split('/').pop()
  return `https://bsky.app/profile/${handle}/post/${rkey}`
}

export type BackfillResult = { imported: number; skipped: number; total: number }

export async function backfillBlueskyImpl(
  workspaceSlug: string,
  socialAccountId: string,
  maxPages = 5,
): Promise<BackfillResult> {
  const r = await requireWorkspaceAccess(workspaceSlug)
  if (!r.ok) throw new Error(r.reason)

  const account = await db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.id, socialAccountId),
      eq(schema.socialAccounts.workspaceId, r.workspace.id),
    ),
  })
  if (!account) throw new Error('Account not found')
  if (account.platform !== 'bluesky') throw new Error('Not a Bluesky account')

  const did = (account.metadata as Record<string, unknown>)?.did as string
  if (!did) throw new Error('Bluesky account missing DID — reconnect it')

  const pdsUrl = await resolvePds(did)
  const handle = account.accountHandle || (await resolveHandle(did))
  logger.info({ socialAccountId, pdsUrl, handle }, 'resolved bluesky PDS')

  let imported = 0
  let skipped = 0
  let total = 0
  let cursor: string | undefined

  for (let page = 0; page < maxPages; page++) {
    // Use com.atproto.repo.listRecords — a PDS-native endpoint that
    // reads directly from the repo without proxying to the AppView.
    const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.listRecords`)
    url.searchParams.set('repo', did)
    url.searchParams.set('collection', 'app.bsky.feed.post')
    url.searchParams.set('limit', '100')
    url.searchParams.set('reverse', 'true')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString())
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.warn({ status: res.status, body: body.slice(0, 300) }, 'bluesky listRecords failed')
      break
    }
    const json = (await res.json()) as ListRecordsResponse
    const records = json.records ?? []
    if (records.length === 0) break

    for (const rec of records) {
      total++
      if (rec.value.$type && rec.value.$type !== 'app.bsky.feed.post') {
        skipped++
        continue
      }
      // Skip replies — we only want top-level posts.
      if (rec.value.reply) {
        skipped++
        continue
      }

      // Dedup: already imported?
      const existing = await db.query.postPlatforms.findFirst({
        where: and(
          eq(schema.postPlatforms.socialAccountId, socialAccountId),
          eq(schema.postPlatforms.platformPostId, rec.uri),
        ),
      })
      if (existing) {
        skipped++
        continue
      }

      const publishedAt = rec.value.createdAt ? new Date(rec.value.createdAt) : new Date()
      const content = rec.value.text ?? ''

      try {
        await db.transaction(async (tx) => {
          const [post] = await tx
            .insert(schema.posts)
            .values({
              workspaceId: r.workspace.id,
              authorId: r.user.id,
              type: 'original',
              status: 'published',
              publishedAt,
            })
            .returning({ id: schema.posts.id })
          if (!post) return

          await tx.insert(schema.postVersions).values({
            postId: post.id,
            platforms: ['bluesky'],
            content,
            firstComment: null,
            isThread: false,
            threadParts: [],
            isDefault: true,
            platformVariables: {},
          })

          await tx.insert(schema.postPlatforms).values({
            postId: post.id,
            socialAccountId,
            platformPostId: rec.uri,
            publishedUrl: postUrl(handle, rec.uri),
            status: 'published',
            publishedAt,
          })
        })
        imported++
      } catch (e) {
        logger.warn(
          { err: e instanceof Error ? e.message : String(e), uri: rec.uri },
          'backfill post insert failed',
        )
        skipped++
      }
    }

    cursor = json.cursor
    if (!cursor) break
  }

  // Trigger an immediate analytics sync so engagement numbers show up
  // without waiting for the 02:00 UTC cron.
  try {
    const { enqueueManualSync } = await import('~/server/queues/analyticsSync')
    await enqueueManualSync({ workspaceId: r.workspace.id, socialAccountId })
  } catch {
    // Non-fatal — analytics will catch up on the next scheduled run.
  }

  logger.info(
    { socialAccountId, imported, skipped, total },
    'bluesky backfill complete',
  )
  return { imported, skipped, total }
}
