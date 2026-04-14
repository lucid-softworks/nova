import type { PublishResult, ReshareContext } from '../index'

export async function resharePost(ctx: ReshareContext): Promise<PublishResult> {
  const ts = Date.now()
  console.log(
    `[STUB] reshare x · @${ctx.account.accountHandle} · source=${ctx.reshare.sourcePostUrl}`,
  )
  return {
    platformPostId: `stub_${ts}`,
    url: `https://x.example/stub/reshare/${ts}`,
    publishedAt: new Date(ts),
  }
}
