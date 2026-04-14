import { createAuthClient } from 'better-auth/react'
import { apiKeyClient } from '@better-auth/api-key/client'

export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  plugins: [apiKeyClient()],
})

export const { signIn, signUp, signOut, useSession, getSession } = authClient
