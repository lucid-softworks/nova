import type { PublishContext, PublishResult } from '../index'

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const ts = Date.now()
  console.log(
    `[STUB] publish facebook · @${ctx.account.accountHandle} · ${ctx.version.content.slice(0, 80)}`,
  )
  return {
    platformPostId: `stub_${ts}`,
    url: `https://facebook.example/stub/${ts}`,
    publishedAt: new Date(ts),
  }
}
