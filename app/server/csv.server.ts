import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import { parseCsv, toCsv } from '~/lib/csv'
import { listPostsImpl, type PostListQuery } from './posts.server'
import type { PlatformKey } from '~/lib/platforms'
import { PLATFORM_KEYS } from '~/lib/platforms'

export type ImportReport = {
  created: number
  skipped: number
  errors: Array<{ row: number; reason: string }>
}

const REQUIRED_COLUMNS = ['content', 'scheduledAt', 'platforms', 'accountHandles'] as const

function parsePlatforms(cell: string): PlatformKey[] {
  const list = cell
    .split(/[|;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const valid: PlatformKey[] = []
  for (const p of list) {
    if ((PLATFORM_KEYS as readonly string[]).includes(p)) valid.push(p as PlatformKey)
  }
  return valid
}

function parseHandles(cell: string): string[] {
  return cell
    .split(/[|;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function importPostsFromCsvImpl(
  slug: string,
  csvText: string,
): Promise<ImportReport> {
  const { workspace, user } = await requireWorkspaceAccess(slug).then((r) => {
    if (!r.ok) throw new Error(r.reason)
    return r
  })

  const rows = parseCsv(csvText)
  if (rows.length === 0) return { created: 0, skipped: 0, errors: [] }
  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) {
      throw new Error(`Missing required column: ${col}`)
    }
  }
  const idx = Object.fromEntries(
    REQUIRED_COLUMNS.map((c) => [c, header.indexOf(c)]),
  ) as Record<(typeof REQUIRED_COLUMNS)[number], number>

  // Load every workspace account up front; resolve handles against it.
  const accounts = await db
    .select({
      id: schema.socialAccounts.id,
      platform: schema.socialAccounts.platform,
      accountHandle: schema.socialAccounts.accountHandle,
    })
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.workspaceId, workspace.id))
  const byHandle = new Map<string, { id: string; platform: PlatformKey }>()
  for (const a of accounts) {
    byHandle.set(
      `${a.platform}:${a.accountHandle.toLowerCase()}`,
      { id: a.id, platform: a.platform as PlatformKey },
    )
  }

  const report: ImportReport = { created: 0, skipped: 0, errors: [] }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!
    const content = (row[idx.content] ?? '').trim()
    const scheduledRaw = (row[idx.scheduledAt] ?? '').trim()
    const platforms = parsePlatforms(row[idx.platforms] ?? '')
    const handles = parseHandles(row[idx.accountHandles] ?? '')

    if (!content) {
      report.skipped++
      report.errors.push({ row: r + 1, reason: 'empty content' })
      continue
    }
    if (platforms.length === 0) {
      report.skipped++
      report.errors.push({ row: r + 1, reason: 'no valid platforms' })
      continue
    }
    const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null
    if (scheduledRaw && Number.isNaN(scheduledAt?.getTime())) {
      report.skipped++
      report.errors.push({ row: r + 1, reason: `invalid scheduledAt "${scheduledRaw}"` })
      continue
    }

    const matchedAccounts: { id: string; platform: PlatformKey }[] = []
    for (const platform of platforms) {
      for (const h of handles) {
        const hit = byHandle.get(`${platform}:${h.toLowerCase()}`)
        if (hit) matchedAccounts.push(hit)
      }
    }
    if (matchedAccounts.length === 0) {
      report.skipped++
      report.errors.push({ row: r + 1, reason: 'no matching connected accounts' })
      continue
    }

    try {
      await db.transaction(async (tx) => {
        const [post] = await tx
          .insert(schema.posts)
          .values({
            workspaceId: workspace.id,
            authorId: user.id,
            type: 'original',
            status: scheduledAt ? 'scheduled' : 'draft',
            scheduledAt,
          })
          .returning({ id: schema.posts.id })
        if (!post) throw new Error('insert failed')

        await tx.insert(schema.postVersions).values({
          postId: post.id,
          platforms,
          content,
          firstComment: null,
          isThread: false,
          threadParts: [],
          isDefault: true,
          platformVariables: {},
        })

        for (const a of matchedAccounts) {
          await tx.insert(schema.postPlatforms).values({
            postId: post.id,
            socialAccountId: a.id,
            status: 'pending',
          })
        }
      })
      report.created++
    } catch (e) {
      report.skipped++
      report.errors.push({
        row: r + 1,
        reason: e instanceof Error ? e.message : 'unknown error',
      })
    }
  }

  return report
}

export async function exportPostsCsvImpl(q: PostListQuery): Promise<string> {
  const rows = await listPostsImpl(q)
  // Second pass: pull version content + platform handles per post so the
  // CSV matches what the user sees in the list.
  const postIds = rows.map((r) => r.id)
  let versions: Array<{ postId: string; content: string; isDefault: boolean }> = []
  let targets: Array<{ postId: string; platform: string; accountHandle: string }> = []
  if (postIds.length > 0) {
    versions = await db
      .select({
        postId: schema.postVersions.postId,
        content: schema.postVersions.content,
        isDefault: schema.postVersions.isDefault,
      })
      .from(schema.postVersions)
      .where(inArray(schema.postVersions.postId, postIds))
    targets = await db
      .select({
        postId: schema.postPlatforms.postId,
        platform: schema.socialAccounts.platform,
        accountHandle: schema.socialAccounts.accountHandle,
      })
      .from(schema.postPlatforms)
      .innerJoin(
        schema.socialAccounts,
        eq(schema.socialAccounts.id, schema.postPlatforms.socialAccountId),
      )
      .where(
        and(
          inArray(schema.postPlatforms.postId, postIds),
        ),
      )
  }

  const contentByPost = new Map<string, string>()
  for (const v of versions) {
    if (v.isDefault || !contentByPost.has(v.postId)) contentByPost.set(v.postId, v.content)
  }
  const targetsByPost = new Map<string, Array<{ platform: string; handle: string }>>()
  for (const t of targets) {
    const list = targetsByPost.get(t.postId) ?? []
    list.push({ platform: t.platform, handle: t.accountHandle })
    targetsByPost.set(t.postId, list)
  }

  const header: Array<string | number | null> = [
    'id',
    'status',
    'type',
    'scheduledAt',
    'publishedAt',
    'content',
    'platforms',
    'accounts',
  ]
  const out: Array<Array<string | number | null>> = [header]
  for (const r of rows) {
    const tgts = targetsByPost.get(r.id) ?? []
    out.push([
      r.id,
      r.status,
      r.type,
      r.scheduledAt ?? '',
      r.publishedAt ?? '',
      contentByPost.get(r.id) ?? '',
      [...new Set(tgts.map((t) => t.platform))].join('|'),
      tgts.map((t) => `${t.platform}:${t.handle}`).join('|'),
    ])
  }
  // BOM for Excel friendliness.
  return `\ufeff${toCsv(out)}`
}
