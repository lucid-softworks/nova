export type PublishErrorCode =
  | 'RATE_LIMITED'
  | 'AUTH_EXPIRED'
  | 'MEDIA_TOO_LARGE'
  | 'INVALID_FORMAT'
  | 'NOT_IMPLEMENTED'
  | 'UNKNOWN'

export class PublishError extends Error {
  readonly code: PublishErrorCode
  readonly userMessage: string
  readonly retryable: boolean

  constructor(opts: {
    code: PublishErrorCode
    message: string
    userMessage?: string
    retryable?: boolean
    cause?: unknown
  }) {
    super(opts.message)
    this.name = 'PublishError'
    this.code = opts.code
    this.userMessage = opts.userMessage ?? opts.message
    this.retryable =
      opts.retryable ??
      (opts.code === 'RATE_LIMITED' || opts.code === 'UNKNOWN')
    if (opts.cause !== undefined) (this as unknown as { cause?: unknown }).cause = opts.cause
  }
}

export function isPublishError(e: unknown): e is PublishError {
  return e instanceof PublishError
}
