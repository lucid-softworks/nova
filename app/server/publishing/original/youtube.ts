import type { PublishContext, PublishResult } from '../index'

export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const ts = Date.now()
  console.log(
    `[STUB] publish youtube · @${ctx.account.accountHandle} · ${ctx.version.content.slice(0, 80)}`,
  )
  return {
    platformPostId: `stub_${ts}`,
    url: `https://youtube.example/stub/${ts}`,
    publishedAt: new Date(ts),
  }
}
