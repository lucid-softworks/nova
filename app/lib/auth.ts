import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db, schema } from '~/server/db'

const requireEnv = (key: string): string => {
  const v = process.env[key]
  if (!v) throw new Error(`${key} is required`)
  return v
}

const optionalEnv = (key: string): string | undefined => process.env[key] || undefined

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: requireEnv('BETTER_AUTH_SECRET'),
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
  },
  socialProviders: {
    google: {
      clientId: optionalEnv('GOOGLE_CLIENT_ID') ?? '',
      clientSecret: optionalEnv('GOOGLE_CLIENT_SECRET') ?? '',
    },
    github: {
      clientId: optionalEnv('GITHUB_CLIENT_ID') ?? '',
      clientSecret: optionalEnv('GITHUB_CLIENT_SECRET') ?? '',
    },
  },
  plugins: [tanstackStartCookies()],
})

export type Auth = typeof auth
