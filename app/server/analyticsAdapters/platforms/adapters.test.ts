import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalyticsAccountCtx } from '../types'

const PLC_RESPONSE = JSON.stringify({
  service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://test.pds.example' }],
})

function ctx(overrides: Partial<AnalyticsAccountCtx> = {}): AnalyticsAccountCtx {
  return {
    id: 'acct-1',
    platform: 'bluesky',
    accountName: 'Test',
    accountHandle: 'test.bsky.social',
    workspaceId: 'ws-1',
    accessToken: 'token',
    refreshToken: null,
    metadata: { did: 'did:plc:test123' },
    platformPostIds: [],
    ...overrides,
  }
}

function mockFetch(responders: Array<(url: string) => Promise<Response> | Response>) {
  let call = 0
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const fn = responders[call++]
    if (!fn) throw new Error(`unexpected fetch call #${call} to ${url}`)
    return fn(url)
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bluesky analytics adapter', () => {
  it('maps account profile into AccountSnapshot', async () => {
    mockFetch([
      () => new Response(PLC_RESPONSE, { status: 200 }),
      () =>
        new Response(
          JSON.stringify({ followersCount: 42, followsCount: 7, postsCount: 123 }),
          { status: 200 },
        ),
    ])
    const mod = await import('./bluesky')
    const snap = await mod.syncAccount(ctx({ platform: 'bluesky' }))
    expect(snap).toEqual({ followers: 42, following: 7, posts: 123 })
  })

  it('returns empty on non-200', async () => {
    mockFetch([
      () => new Response(PLC_RESPONSE, { status: 200 }),
      () => new Response('nope', { status: 500 }),
    ])
    const mod = await import('./bluesky')
    expect(await mod.syncAccount(ctx())).toEqual({})
  })

  it('maps post metrics and sums engagements', async () => {
    mockFetch([
      () => new Response(PLC_RESPONSE, { status: 200 }),
      () =>
        new Response(
          JSON.stringify({
            posts: [
              { uri: 'at://x/1', likeCount: 5, repostCount: 2, replyCount: 1 },
              { uri: 'at://x/2', likeCount: 0, repostCount: 0, replyCount: 0 },
            ],
          }),
          { status: 200 },
        ),
    ])
    const mod = await import('./bluesky')
    const res = await mod.syncPosts(ctx({ platformPostIds: ['at://x/1', 'at://x/2'] }))
    expect(res).toHaveLength(2)
    expect(res[0]).toEqual({
      platformPostId: 'at://x/1',
      likes: 5,
      shares: 2,
      comments: 1,
      engagements: 8,
    })
  })
})

describe('mastodon analytics adapter', () => {
  it('maps verify_credentials into followers/following/posts', async () => {
    mockFetch([
      () =>
        new Response(
          JSON.stringify({
            followers_count: 10,
            following_count: 3,
            statuses_count: 80,
          }),
          { status: 200 },
        ),
    ])
    const mod = await import('./mastodon')
    const snap = await mod.syncAccount(
      ctx({ platform: 'mastodon', metadata: { instance: 'mastodon.social' } }),
    )
    expect(snap).toEqual({ followers: 10, following: 3, posts: 80 })
  })

  it('skips when no instance metadata', async () => {
    const mod = await import('./mastodon')
    expect(await mod.syncAccount(ctx({ platform: 'mastodon' }))).toEqual({})
  })
})

describe('x analytics adapter', () => {
  it('maps public_metrics into followers/following/posts', async () => {
    mockFetch([
      () =>
        new Response(
          JSON.stringify({
            data: {
              public_metrics: {
                followers_count: 500,
                following_count: 100,
                tweet_count: 1000,
              },
            },
          }),
          { status: 200 },
        ),
    ])
    const mod = await import('./x')
    const snap = await mod.syncAccount(
      ctx({ platform: 'x', metadata: { userId: '12345' } }),
    )
    expect(snap).toEqual({ followers: 500, following: 100, posts: 1000 })
  })
})
