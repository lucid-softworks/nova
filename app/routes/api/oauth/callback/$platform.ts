import { createFileRoute } from '@tanstack/react-router'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { decrypt } from '~/lib/encryption'
import type { PlatformKey } from '~/lib/platforms'
import {
  exchangeCode,
  fetchUserInfo,
  getProvider,
  saveSocialAccount,
} from '~/server/oauth/flow.server'
import { OAUTH_COOKIE } from '~/server/accounts.server'

type PendingState = {
  workspaceId: string
  workspaceSlug: string
  platform: Exclude<PlatformKey, 'bluesky' | 'mastodon'>
  codeVerifier?: string
  state: string
}

export const Route = createFileRoute('/api/oauth/callback/$platform')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        if (!code || !state) return Response.json({ error: 'Missing code or state' }, { status: 400 })

        const cookie = getCookie(OAUTH_COOKIE)
        if (!cookie) return Response.json({ error: 'Missing OAuth state' }, { status: 400 })
        let pending: PendingState
        try {
          pending = JSON.parse(decrypt(cookie)) as PendingState
        } catch {
          return Response.json({ error: 'Invalid OAuth state' }, { status: 400 })
        }
        if (pending.state !== state) return Response.json({ error: 'State mismatch' }, { status: 400 })
        if (pending.platform !== params.platform) {
          return Response.json({ error: 'Platform mismatch' }, { status: 400 })
        }

        const provider = getProvider(pending.platform)
        if (!provider) return Response.json({ error: 'Provider not configured' }, { status: 400 })

        const baseUrl = process.env.APP_URL ?? 'http://localhost:3000'
        const redirectUri = `${baseUrl}/api/oauth/callback/${pending.platform}`

        try {
          const tokens = await exchangeCode({
            provider,
            code,
            redirectUri,
            codeVerifier: pending.codeVerifier,
          })
          const info = await fetchUserInfo({ provider, accessToken: tokens.accessToken })

          await saveSocialAccount({
            workspaceId: pending.workspaceId,
            platform: pending.platform,
            accountName: info.accountName,
            accountHandle: info.accountHandle,
            avatarUrl: info.avatarUrl,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiresAt: tokens.expiresIn
              ? new Date(Date.now() + tokens.expiresIn * 1000)
              : null,
            metadata: info.extra ?? {},
          })
        } catch (e) {
          const message = e instanceof Error ? e.message : 'OAuth failed'
          return new Response(
            `<!doctype html><meta charset=utf-8><title>Connection failed</title><p style="font:14px system-ui;padding:24px;max-width:640px;">${escapeHtml(message)}</p><a style="font:14px system-ui;padding:24px;" href="/${pending.workspaceSlug}/accounts">Back to accounts</a>`,
            { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          )
        }

        setCookie(OAUTH_COOKIE, '', { path: '/', maxAge: 0 })
        return new Response(null, {
          status: 302,
          headers: { Location: `/${pending.workspaceSlug}/accounts` },
        })
      },
    },
  },
})

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}
