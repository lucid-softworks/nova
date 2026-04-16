import { and, eq, lte } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { logger } from '~/lib/logger'
import { nextCronFire } from '~/lib/cron'

export async function tickRecurringPosts(): Promise<void> {
  const now = new Date()
  const due = await db
    .select()
    .from(schema.recurringPosts)
    .where(
      and(
        eq(schema.recurringPosts.active, true),
        lte(schema.recurringPosts.nextFireAt, now),
      ),
    )

  for (const rule of due) {
    try {
      const source = await db.query.posts.findFirst({
        where: eq(schema.posts.id, rule.sourcePostId),
      })
      if (!source) {
        await db
          .update(schema.recurringPosts)
          .set({ active: false })
          .where(eq(schema.recurringPosts.id, rule.id))
        continue
      }

      const versions = await db
        .select()
        .from(schema.postVersions)
        .where(eq(schema.postVersions.postId, rule.sourcePostId))
      const defaultV = versions.find((v) => v.isDefault) ?? versions[0]
      if (!defaultV) continue

      const scheduledAt = rule.nextFireAt ?? now

      await db.transaction(async (tx) => {
        const [post] = await tx
          .insert(schema.posts)
          .values({
            workspaceId: rule.workspaceId,
            authorId: rule.createdById ?? source.authorId,
            type: 'original',
            status: 'scheduled',
            scheduledAt,
          })
          .returning({ id: schema.posts.id })
        if (!post) return

        await tx.insert(schema.postVersions).values({
          postId: post.id,
          platforms: defaultV.platforms,
          content: defaultV.content,
          firstComment: defaultV.firstComment,
          isThread: defaultV.isThread,
          threadParts: defaultV.threadParts,
          isDefault: true,
          platformVariables: defaultV.platformVariables,
        })

        for (const accountId of rule.socialAccountIds) {
          await tx.insert(schema.postPlatforms).values({
            postId: post.id,
            socialAccountId: accountId,
            status: 'pending',
          })
        }
      })

      const nextFire = nextCronFire(rule.cronExpression, scheduledAt)
      await db
        .update(schema.recurringPosts)
        .set({ lastFiredAt: now, nextFireAt: nextFire })
        .where(eq(schema.recurringPosts.id, rule.id))

      logger.info(
        { recurringId: rule.id, scheduledAt: scheduledAt.toISOString() },
        'recurring post cloned',
      )
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e.message : String(e), recurringId: rule.id },
        'recurring tick failed',
      )
    }
  }
}
