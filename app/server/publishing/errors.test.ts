import { describe, expect, it } from 'vitest'
import { PublishError, isPublishError } from './errors'

describe('PublishError', () => {
  it('treats RATE_LIMITED as retryable by default', () => {
    const err = new PublishError({ code: 'RATE_LIMITED', message: 'slow down' })
    expect(err.retryable).toBe(true)
  })

  it('treats UNKNOWN as retryable by default', () => {
    const err = new PublishError({ code: 'UNKNOWN', message: 'oops' })
    expect(err.retryable).toBe(true)
  })

  it('treats AUTH_EXPIRED as non-retryable by default', () => {
    const err = new PublishError({ code: 'AUTH_EXPIRED', message: 'reconnect' })
    expect(err.retryable).toBe(false)
  })

  it('honours explicit retryable overrides', () => {
    const err = new PublishError({
      code: 'UNKNOWN',
      message: 'non-retry',
      retryable: false,
    })
    expect(err.retryable).toBe(false)
  })

  it('falls back to message when userMessage is omitted', () => {
    const err = new PublishError({ code: 'UNKNOWN', message: 'raw' })
    expect(err.userMessage).toBe('raw')
  })

  it('isPublishError narrows unknown values', () => {
    const err: unknown = new PublishError({ code: 'UNKNOWN', message: 'x' })
    expect(isPublishError(err)).toBe(true)
    expect(isPublishError(new Error('plain'))).toBe(false)
    expect(isPublishError(null)).toBe(false)
  })
})
