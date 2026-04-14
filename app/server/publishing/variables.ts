import { asc, eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'

export type VariableMap = Record<string, string>

export function substitute(text: string, vars: VariableMap): string {
  if (!text) return text
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => vars[key] ?? match)
}

/**
 * For a post in a campaign, build a variable map with {stepN_<platform>_url}
 * keys for every already-published prior step's platform targets.
 * Non-campaign posts return an empty map plus the simple {date}/{time}/{day}
 * replacements.
 */
export async function buildVariableMap(postId: string): Promise<VariableMap> {
  const baseVars: VariableMap = simpleDateVars()

  const post = await db.query.posts.findFirst({
    where: eq(schema.posts.id, postId),
  })
  if (!post?.campaignId) return baseVars

  const steps = await db
    .select()
    .from(schema.campaignSteps)
    .where(eq(schema.campaignSteps.campaignId, post.campaignId))
    .orderBy(asc(schema.campaignSteps.stepOrder))

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    const ordinal = i + 1
    if (step.status !== 'published' || !step.postId) continue
    const targets = await db
      .select({
        platform: schema.socialAccounts.platform,
        url: schema.postPlatforms.publishedUrl,
        status: schema.postPlatforms.status,
      })
      .from(schema.postPlatforms)
      .innerJoin(
        schema.socialAccounts,
        eq(schema.socialAccounts.id, schema.postPlatforms.socialAccountId),
      )
      .where(eq(schema.postPlatforms.postId, step.postId))

    for (const t of targets) {
      if (t.status !== 'published' || !t.url) continue
      const platform = t.platform as PlatformKey
      const name = PLATFORMS[platform].urlVariableName
      if (!name) continue
      const key = `step${ordinal}_${name}`
      baseVars[key] = t.url
    }
  }
  return baseVars
}

function simpleDateVars(): VariableMap {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: d.toISOString().slice(0, 10),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    day: String(d.getDate()),
    month: d.toLocaleString(undefined, { month: 'long' }),
    year: String(d.getFullYear()),
  }
}
