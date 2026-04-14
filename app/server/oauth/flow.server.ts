import { createHash, randomBytes } from 'node:crypto'
import { buildProviderRegistry, type OAuthProviderConfig } from './providers.server'
import type { PlatformKey } from '~/lib/platforms'
import { encrypt } from '~/lib/encryption'
import { db, schema } from '~/server/db'
import { and, eq } from 'drizzle-orm'

export type OAuthPendingState = {
  workspaceId: string
  platform: Exclude<PlatformKey, 'bluesky' | 'mastodon'>
  codeVerifier?: string
}

const registry = buildProviderRegistry()

export function getProvider(
  platform: Exclude<PlatformKey, 'bluesky' | 'mastodon'>,
): OAuthProviderConfig | null {
  return registry[platform] ?? null
}

export function configuredProviders(): string[] {
  return Object.keys(registry)
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function makePkce() {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function buildAuthorizeUrl(opts: {
  provider: OAuthProviderConfig
  state: string
  redirectUri: string
  codeChallenge?: string
}): string {
  const u = new URL(opts.provider.authorizeUrl)
  u.searchParams.set('client_id', opts.provider.clientId)
  u.searchParams.set('redirect_uri', opts.redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', opts.provider.scopes.join(' '))
  u.searchParams.set('state', opts.state)
  if (opts.provider.usePKCE && opts.codeChallenge) {
    u.searchParams.set('code_challenge', opts.codeChallenge)
    u.searchParams.set('code_challenge_method', 'S256')
  }
  for (const [k, v] of Object.entries(opts.provider.extraAuthorizeParams ?? {})) {
    u.searchParams.set(k, v)
  }
  return u.toString()
}

export async function exchangeCode(opts: {
  provider: OAuthProviderConfig
  code: string
  redirectUri: string
  codeVerifier?: string
}): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number | null }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.provider.clientId,
    client_secret: opts.provider.clientSecret,
  })
  if (opts.codeVerifier) body.set('code_verifier', opts.codeVerifier)

  const res = await fetch(opts.provider.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${txt.slice(0, 500)}`)
  }
  const json = (await res.json()) as Record<string, unknown>
  const accessToken = typeof json.access_token === 'string' ? json.access_token : null
  if (!accessToken) throw new Error('No access_token in token response')
  const refreshToken = typeof json.refresh_token === 'string' ? json.refresh_token : null
  const expiresIn =
    typeof json.expires_in === 'number'
      ? json.expires_in
      : typeof json.expires_in === 'string'
        ? Number(json.expires_in)
        : null
  return { accessToken, refreshToken, expiresIn }
}

export async function fetchUserInfo(opts: {
  provider: OAuthProviderConfig
  accessToken: string
}) {
  const res = await fetch(opts.provider.meEndpoint, {
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`User info failed (${res.status}): ${txt.slice(0, 500)}`)
  }
  const raw = await res.json()
  return opts.provider.parseUser(raw)
}

export async function saveSocialAccount(args: {
  workspaceId: string
  platform: PlatformKey
  accountName: string
  accountHandle: string
  avatarUrl: string | null
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
  metadata?: Record<string, unknown>
}) {
  const encryptedAccess = encrypt(args.accessToken)
  const encryptedRefresh = args.refreshToken ? encrypt(args.refreshToken) : null

  const existing = await db
    .select({ id: schema.socialAccounts.id })
    .from(schema.socialAccounts)
    .where(
      and(
        eq(schema.socialAccounts.workspaceId, args.workspaceId),
        eq(schema.socialAccounts.platform, args.platform),
        eq(schema.socialAccounts.accountHandle, args.accountHandle),
      ),
    )
    .limit(1)

  if (existing[0]) {
    await db
      .update(schema.socialAccounts)
      .set({
        accountName: args.accountName,
        avatarUrl: args.avatarUrl,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        tokenExpiresAt: args.tokenExpiresAt,
        metadata: args.metadata ?? {},
        status: 'connected',
        lastSyncedAt: new Date(),
      })
      .where(eq(schema.socialAccounts.id, existing[0].id))
    return existing[0].id
  }

  const [row] = await db
    .insert(schema.socialAccounts)
    .values({
      workspaceId: args.workspaceId,
      platform: args.platform,
      accountName: args.accountName,
      accountHandle: args.accountHandle,
      avatarUrl: args.avatarUrl,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenExpiresAt: args.tokenExpiresAt,
      metadata: args.metadata ?? {},
      status: 'connected',
      lastSyncedAt: new Date(),
    })
    .returning({ id: schema.socialAccounts.id })
  return row!.id
}
