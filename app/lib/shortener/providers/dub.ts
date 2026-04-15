import { Dub } from 'dub'
import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import type { ShortenCtx, ShortenResult, ShortenerProvider } from '../types'

let client: Dub | null = null
function dub(): Dub {
  if (client) return client
  const token = process.env.DUB_API_KEY
  if (!token) throw new Error('DUB_API_KEY not set')
  client = new Dub({ token })
  return client
}

export const dubProvider: ShortenerProvider = {
  name: 'dub',
  async shorten(ctx: ShortenCtx): Promise<ShortenResult> {
    const existing = await db.query.shortLinks.findFirst({
      where: eq(schema.shortLinks.targetUrl, ctx.targetUrl),
    })
    if (existing?.externalId) {
      // Re-materialise the public URL from the stored slug — Dub's
      // public form is `https://{domain}/{key}`.
      const base = process.env.DUB_DOMAIN ?? 'dub.sh'
      return {
        url: `https://${base}/${existing.slug}`,
        slug: existing.slug,
        externalId: existing.externalId,
      }
    }

    const res = await dub().links.create({
      url: ctx.targetUrl,
      domain: process.env.DUB_DOMAIN,
      externalId: `ws_${ctx.workspaceId}`,
      tagNames: [`workspace:${ctx.workspaceId}`],
    })

    await db.insert(schema.shortLinks).values({
      workspaceId: ctx.workspaceId,
      slug: res.key,
      targetUrl: ctx.targetUrl,
      createdById: ctx.userId,
      externalId: res.id,
    })

    return {
      url: res.shortLink,
      slug: res.key,
      externalId: res.id,
    }
  },
  // Dub owns the redirect — nothing to resolve locally.
  betterAuthPlugin() {
    const token = process.env.DUB_API_KEY
    if (!token) return null
    // Lazy import so the plugin only loads when configured.
    const mod = require('@dub/better-auth') as {
      dubAnalytics?: (opts: unknown) => unknown
    }
    const factory = mod.dubAnalytics
    if (!factory) return null
    return factory({ dubClient: dub() })
  },
}
