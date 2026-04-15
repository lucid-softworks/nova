import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { logger } from '~/lib/logger'
import { sendEmail } from '~/server/mailer.server'
import { buildDigestFor, renderDigest } from './build'

export async function sendDigestsForAll(): Promise<void> {
  const users = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.digestOptIn, true))

  for (const u of users) {
    const memberships = await db
      .select({ workspaceId: schema.workspaces.id })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
      .innerJoin(
        schema.workspaces,
        eq(schema.workspaces.organizationId, schema.organization.id),
      )
      .where(eq(schema.member.userId, u.id))

    for (const m of memberships) {
      try {
        const summary = await buildDigestFor(u.id, m.workspaceId)
        if (!summary) continue
        if (summary.published === 0 && summary.failed === 0 && summary.upcoming.length === 0) {
          // Skip empty digests rather than spam "0/0/0".
          continue
        }
        const { subject, text, html } = renderDigest(summary)
        await sendEmail({ to: summary.userEmail, subject, text, html })
        logger.info(
          { userId: summary.userId, workspaceId: summary.workspaceId },
          'digest sent',
        )
      } catch (e) {
        logger.error(
          { err: e instanceof Error ? e.message : String(e), userId: u.id },
          'digest send failed',
        )
      }
      // Gentle pacing so the mailer doesn't see a big burst.
      await new Promise((r) => setTimeout(r, 250))
    }
  }
}
