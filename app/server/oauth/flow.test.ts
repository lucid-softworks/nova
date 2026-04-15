import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

// flow.server.ts imports '~/server/db' at the top level; stub it so the test
// runs without a live Postgres connection.
vi.mock('~/server/db', () => ({ db: {} as unknown, schema: {} as unknown }))

describe('PKCE helpers', () => {
  it('makePkce returns a verifier/challenge pair where SHA256(verifier) === challenge', async () => {
    const { makePkce } = await import('./flow.server')
    const { verifier, challenge } = makePkce()
    const hash = createHash('sha256').update(verifier).digest()
    const expected = hash
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(challenge).toBe(expected)
  })

  it('buildAuthorizeUrl serialises scopes, state, and PKCE challenge', async () => {
    const { buildAuthorizeUrl } = await import('./flow.server')
    const url = buildAuthorizeUrl({
      provider: {
        clientId: 'cid',
        clientSecret: '',
        authorizeUrl: 'https://example.com/oauth/authorize',
        tokenUrl: '',
        scopes: ['read', 'write'],
        meEndpoint: '',
        usePKCE: true,
        parseUser: () => ({ accountName: '', accountHandle: '', avatarUrl: null }),
      },
      state: 'STATE123',
      redirectUri: 'https://app.local/cb',
      codeChallenge: 'CHALLENGE',
    })
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://example.com/oauth/authorize')
    expect(u.searchParams.get('client_id')).toBe('cid')
    expect(u.searchParams.get('redirect_uri')).toBe('https://app.local/cb')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('scope')).toBe('read write')
    expect(u.searchParams.get('state')).toBe('STATE123')
    expect(u.searchParams.get('code_challenge')).toBe('CHALLENGE')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('merges extraAuthorizeParams', async () => {
    const { buildAuthorizeUrl } = await import('./flow.server')
    const url = buildAuthorizeUrl({
      provider: {
        clientId: 'x',
        clientSecret: '',
        authorizeUrl: 'https://example.com/authorize',
        tokenUrl: '',
        scopes: [],
        meEndpoint: '',
        extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
        parseUser: () => ({ accountName: '', accountHandle: '', avatarUrl: null }),
      },
      state: 's',
      redirectUri: 'https://r',
    })
    const u = new URL(url)
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent')
  })
})
