import pino from 'pino'

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

export const logger = pino({
  level,
  base: { service: 'nova' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.accessToken',
      '*.refreshToken',
      '*.password',
    ],
    censor: '[redacted]',
  },
})

/**
 * Build a child logger for a specific job or request, pre-tagged with the
 * correlation ids the worker / handler wants to carry around.
 */
export function withContext(
  ctx: Record<string, string | number | boolean | null | undefined>,
): pino.Logger {
  return logger.child(ctx)
}
