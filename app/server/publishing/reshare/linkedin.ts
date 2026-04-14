import type { PublishResult, ReshareContext } from '../index'

export async function resharePost(ctx: ReshareContext): Promise<PublishResult> {
  const ts = Date.now()
  console.log(
    `[STUB] reshare linkedin · @${ctx.account.accountHandle} · source=${ctx.reshare.sourcePostUrl}`,
  )
  return {
    platformPostId: `stub_${ts}`,
    url: `https://linkedin.example/stub/reshare/${ts}`,
    publishedAt: new Date(ts),
  }
}
