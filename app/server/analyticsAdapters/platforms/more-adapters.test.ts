import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalyticsAccountCtx } from '../types'

function ctx(overrides: Partial<AnalyticsAccountCtx> = {}): AnalyticsAccountCtx {
  return {
    id: 'acct-1',
    platform: 'reddit',
    accountName: 'Test',
    accountHandle: 'tester',
    workspaceId: 'ws-1',
    accessToken: 'token',
    refreshToken: null,
    metadata: {},
    platformPostIds: [],
    ...overrides,
  }
}

function mockFetch(responders: Array<(url: string) => Promise<Response> | Response>) {
  let call = 0
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const r = responders[call++]
    if (!r) throw new Error(`unexpected fetch call #${call} to ${url}`)
    return r(url)
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reddit analytics adapter', () => {
  it('syncAccount maps karma into engagements', async () => {
    mockFetch([
      () =>
        new Response(
          JSON.stringify({ link_karma: 100, comment_karma: 50 }),
          { status: 200 },
        ),
    ])
    const mod = await import('./reddit')
    const snap = await mod.syncAccount(ctx({ platform: 'reddit' }))
    expect(snap).toEqual({ engagements: 150 })
  })

  it('syncPosts parses /api/info listing into per-post metrics', async () => {
    mockFetch([
      (url) => {
        expect(url).toContain('/api/info')
        return new Response(
          JSON.stringify({
            data: {
              children: [
                {
                  data: {
                    name: 't3_abc',
                    ups: 10,
                    score: 10,
                    num_comments: 3,
                    view_count: 100,
                  },
                },
                {
                  data: {
                    name: 't3_def',
                    ups: 4,
                    score: 4,
                    num_comments: 1,
                    view_count: null,
                  },
                },
              ],
            },
          }),
          { status: 200 },
        )
      },
    ])
    const mod = await import('./reddit')
    const res = await mod.syncPosts(
      ctx({ platform: 'reddit', platformPostIds: ['t3_abc', 'def'] }),
    )
    expect(res).toHaveLength(2)
    expect(res[0]).toEqual({
      platformPostId: 't3_abc',
      likes: 10,
      comments: 3,
      engagements: 13,
      views: 100,
    })
    expect(res[1]!.platformPostId).toBe('t3_def')
    expect(res[1]!.views).toBe(0)
  })
})

describe('pinterest analytics adapter', () => {
  it('syncAccount maps summary_metrics', async () => {
    mockFetch([
      () =>
        new Response(
          JSON.stringify({
            all: {
              summary_metrics: {
                IMPRESSION: 1000,
                PIN_CLICK: 25,
                ENGAGEMENT: 75,
              },
            },
          }),
          { status: 200 },
        ),
    ])
    const mod = await import('./pinterest')
    const snap = await mod.syncAccount(ctx({ platform: 'pinterest' }))
    expect(snap).toEqual({ impressions: 1000, clicks: 25, engagements: 75 })
  })
})

describe('tumblr analytics adapter', () => {
  it('syncAccount maps response.blog.{followers, posts}', async () => {
    mockFetch([
      () =>
        new Response(
          JSON.stringify({
            response: { blog: { followers: 321, posts: 42 } },
          }),
          { status: 200 },
        ),
    ])
    const mod = await import('./tumblr')
    const snap = await mod.syncAccount(
      ctx({ platform: 'tumblr', metadata: { blog: 'myblog.tumblr.com' } }),
    )
    expect(snap).toEqual({ followers: 321, posts: 42 })
  })
})

describe('linkedin analytics adapter', () => {
  it('syncAccount returns {} when metadata.urn is missing and makes no fetch', async () => {
    const fetchFn = mockFetch([])
    const mod = await import('./linkedin')
    const snap = await mod.syncAccount(ctx({ platform: 'linkedin', metadata: {} }))
    expect(snap).toEqual({})
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
