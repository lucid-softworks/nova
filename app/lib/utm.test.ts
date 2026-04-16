import { describe, expect, it } from 'vitest'
import { appendUtmParams, mergeUtmParams } from './utm'

describe('appendUtmParams', () => {
  it('appends params to a bare URL', () => {
    const out = appendUtmParams('Check https://example.com out!', {
      utm_source: 'nova',
      utm_campaign: 'launch',
    })
    expect(out).toBe('Check https://example.com/?utm_source=nova&utm_campaign=launch out!')
  })

  it('preserves existing query params', () => {
    const out = appendUtmParams('https://example.com?ref=x', { utm_source: 'nova' })
    expect(out).toContain('ref=x')
    expect(out).toContain('utm_source=nova')
  })

  it('does not duplicate params already on the URL', () => {
    const out = appendUtmParams('https://example.com?utm_source=old', { utm_source: 'new' })
    expect(out).toBe('https://example.com/?utm_source=old')
  })

  it('skips empty param values', () => {
    const out = appendUtmParams('https://example.com', { utm_source: '', utm_medium: 'social' })
    expect(out).toBe('https://example.com/?utm_medium=social')
  })

  it('handles multiple URLs in content', () => {
    const out = appendUtmParams(
      'See https://a.com and https://b.com',
      { utm_source: 'x' },
    )
    expect(out).toContain('https://a.com/?utm_source=x')
    expect(out).toContain('https://b.com/?utm_source=x')
  })

  it('leaves content without URLs untouched', () => {
    expect(appendUtmParams('no links here', { utm_source: 'x' })).toBe('no links here')
  })
})

describe('mergeUtmParams', () => {
  it('per-post overrides workspace defaults', () => {
    const out = mergeUtmParams(
      { utm_source: 'default', utm_medium: 'social' },
      { utm_source: 'override' },
    )
    expect(out.utm_source).toBe('override')
    expect(out.utm_medium).toBe('social')
  })
})
