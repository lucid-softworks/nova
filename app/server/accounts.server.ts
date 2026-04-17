import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { setCookie } from '@tanstack/react-start/server'
import { db, schema } from './db'
import { requireWorkspaceAccess } from './session.server'
import { encrypt } from '~/lib/encryption'
import { safeFetch } from '~/lib/safe-fetch'
import type { PlatformKey } from '~/lib/platforms'
import { buildAuthorizeUrl, getProvider, makePkce, saveSocialAccount } from './oauth/flow.server'
import { assertWithinLimit } from '~/lib/billing/limits'

export type AccountSummary = {
  id: string
  platform: PlatformKey
  accountName: string
  accountHandle: string
  avatarUrl: string | null
  status: 'connected' | 'disconnected' | 'expired'
  tokenExpiresAt: string | null
  lastSyncedAt: string | null
  createdAt: string
}

function ensureWs(slug: string) {
  return requireWorkspaceAccess(slug).then((r) => {
    if (!r.ok) throw new Error(r.reason)
    return r
  })
}

export async function listAccountsImpl(slug: string): Promise<AccountSummary[]> {
  const { workspace } = await ensureWs(slug)
  const rows = await db
    .select({
      id: schema.socialAccounts.id,
      platform: schema.socialAccounts.platform,
      accountName: schema.socialAccounts.accountName,
      accountHandle: schema.socialAccounts.accountHandle,
      avatarUrl: schema.socialAccounts.avatarUrl,
      status: schema.socialAccounts.status,
      tokenExpiresAt: schema.socialAccounts.tokenExpiresAt,
      lastSyncedAt: schema.socialAccounts.lastSyncedAt,
      createdAt: schema.socialAccounts.createdAt,
    })
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.workspaceId, workspace.id))

  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    accountName: r.accountName,
    accountHandle: r.accountHandle,
    avatarUrl: r.avatarUrl,
    status: r.status,
    tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null,
    lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function disconnectAccountImpl(slug: string, accountId: string) {
  const { workspace } = await ensureWs(slug)
  await db
    .update(schema.socialAccounts)
    .set({
      status: 'disconnected',
      accessToken: '',
      refreshToken: null,
      tokenExpiresAt: null,
    })
    .where(
      and(
        eq(schema.socialAccounts.id, accountId),
        eq(schema.socialAccounts.workspaceId, workspace.id),
      ),
    )
  return { ok: true as const }
}

export async function connectBlueskyImpl(slug: string, identifier: string, password: string) {
  const { workspace } = await ensureWs(slug)
  await assertWithinLimit(workspace.id, 'account')

  const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Bluesky sign-in failed (${res.status}): ${txt.slice(0, 400)}`)
  }
  const json = (await res.json()) as {
    did?: string
    handle?: string
    accessJwt?: string
    refreshJwt?: string
  }
  if (!json.accessJwt || !json.did || !json.handle) {
    throw new Error('Bluesky returned an unexpected session payload')
  }

  const profileRes = await fetch(
    `https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(json.handle)}`,
    { headers: { Authorization: `Bearer ${json.accessJwt}` } },
  )
  let avatarUrl: string | null = null
  let accountName = json.handle
  if (profileRes.ok) {
    const profile = (await profileRes.json()) as { avatar?: string; displayName?: string }
    avatarUrl = profile.avatar ?? null
    if (profile.displayName) accountName = profile.displayName
  }

  const id = await saveSocialAccount({
    workspaceId: workspace.id,
    platform: 'bluesky',
    accountName,
    accountHandle: json.handle,
    avatarUrl,
    accessToken: json.accessJwt,
    refreshToken: json.refreshJwt ?? null,
    tokenExpiresAt: null,
    metadata: { did: json.did },
  })
  return { id }
}

const OAUTH_COOKIE = 'nova_oauth_state'

function normalizeInstance(raw: string): string {
  const trimmed = raw.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (!trimmed || !/^[a-z0-9.-]+$/i.test(trimmed)) {
    throw new Error('Invalid Mastodon instance hostname')
  }
  return `https://${trimmed}`
}

const MASTODON_SCOPES = 'read write follow push'

export async function startMastodonOAuthImpl(slug: string, instanceRaw: string) {
  const { workspace } = await ensureWs(slug)
  await assertWithinLimit(workspace.id, 'account')
  const instance = normalizeInstance(instanceRaw)
  const baseUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  const redirectUri = `${baseUrl}/api/oauth/callback/mastodon`

  // Dynamic app registration — Mastodon's open federation means there's no
  // central directory of client credentials; every instance requires us to
  // register before the OAuth dance.
  const regRes = await safeFetch(`${instance}/api/v1/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Nova',
      redirect_uris: redirectUri,
      scopes: MASTODON_SCOPES,
      website: baseUrl,
    }),
  })
  if (!regRes.ok) {
    const txt = await regRes.text()
    throw new Error(`Mastodon app registration failed (${regRes.status}): ${txt.slice(0, 300)}`)
  }
  const reg = (await regRes.json()) as { client_id?: string; client_secret?: string }
  if (!reg.client_id || !reg.client_secret) {
    throw new Error('Mastodon registration returned no client credentials')
  }

  const state = randomBytes(24).toString('hex')
  const payload = JSON.stringify({
    workspaceId: workspace.id,
    workspaceSlug: slug,
    platform: 'mastodon' as const,
    instance,
    clientId: reg.client_id,
    clientSecret: reg.client_secret,
    state,
  })
  setCookie(OAUTH_COOKIE, encrypt(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  })

  const u = new URL(`${instance}/oauth/authorize`)
  u.searchParams.set('client_id', reg.client_id)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', MASTODON_SCOPES)
  u.searchParams.set('state', state)
  return { url: u.toString() }
}

export async function startOAuthImpl(
  slug: string,
  platform: Exclude<PlatformKey, 'bluesky' | 'mastodon'>,
) {
  const { workspace } = await ensureWs(slug)
  await assertWithinLimit(workspace.id, 'account')
  const provider = getProvider(platform)
  if (!provider) {
    throw new Error(
      `${platform} is not configured. Set the provider credentials in your environment.`,
    )
  }
  const state = randomBytes(24).toString('hex')
  const baseUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  const redirectUri = `${baseUrl}/api/oauth/callback/${platform}`

  const pkce = provider.usePKCE ? makePkce() : null
  const payload = JSON.stringify({
    workspaceId: workspace.id,
    workspaceSlug: slug,
    platform,
    codeVerifier: pkce?.verifier,
    state,
  })
  const encrypted = encrypt(payload)

  setCookie(OAUTH_COOKIE, encrypted, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  })

  const url = buildAuthorizeUrl({
    provider,
    state,
    redirectUri,
    codeChallenge: pkce?.challenge,
  })
  return { url }
}

export { OAUTH_COOKIE }
