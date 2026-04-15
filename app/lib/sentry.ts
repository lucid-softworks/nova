import * as Sentry from '@sentry/node'

let initialized = false

/**
 * Initialize Sentry once per process. Safe to call from both the web
 * server and the standalone worker — guarded so double-init is a no-op.
 * When `SENTRY_DSN` is empty this is a no-op too.
 */
export function initSentry(): void {
  if (initialized) return
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  })
  initialized = true
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}

export { Sentry }
