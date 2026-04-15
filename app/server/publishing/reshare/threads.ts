import { PublishError } from '../errors'
import type { PublishResult, ReshareContext } from '../index'

export async function resharePost(_ctx: ReshareContext): Promise<PublishResult> {
  throw new PublishError({
    code: 'NOT_IMPLEMENTED',
    message: 'Threads reshare not supported',
    userMessage: 'Threads reshare is not supported via the Threads API.',
    retryable: false,
  })
}
