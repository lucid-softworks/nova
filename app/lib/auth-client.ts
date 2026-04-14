import { createAuthClient } from 'better-auth/react'
import { apiKeyClient } from '@better-auth/api-key/client'
import { passkeyClient } from '@better-auth/passkey/client'
import {
  twoFactorClient,
  magicLinkClient,
  emailOTPClient,
  multiSessionClient,
  adminClient,
  organizationClient,
} from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  plugins: [
    apiKeyClient(),
    passkeyClient(),
    twoFactorClient(),
    magicLinkClient(),
    emailOTPClient(),
    multiSessionClient(),
    adminClient(),
    organizationClient(),
  ],
})

export const { signIn, signUp, signOut, useSession, getSession } = authClient
