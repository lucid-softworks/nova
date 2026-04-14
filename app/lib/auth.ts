import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { apiKey } from '@better-auth/api-key'
import { passkey } from '@better-auth/passkey'
import {
  twoFactor,
  magicLink,
  emailOTP,
  haveIBeenPwned,
  multiSession,
  captcha,
} from 'better-auth/plugins'
import { db, schema } from '~/server/db'

const requireEnv = (key: string): string => {
  const v = process.env[key]
  if (!v) throw new Error(`${key} is required`)
  return v
}

const optionalEnv = (key: string): string | undefined => process.env[key] || undefined

// Dev-safe mailer: logs magic-link + OTP payloads to the console until a
// real mailer lands in Stage 22. Swap this out for server/mailer when it
// arrives.
function devLog(label: string, payload: Record<string, unknown>) {
  console.log(`[auth:${label}]`, JSON.stringify(payload))
}

const captchaSiteKey = optionalEnv('CAPTCHA_SITE_KEY')
const captchaSecretKey = optionalEnv('CAPTCHA_SECRET_KEY')

const plugins = [
  apiKey({
    defaultPrefix: 'sk_',
    apiKeyHeaders: ['x-api-key', 'authorization'],
    enableSessionForAPIKeys: true,
    customAPIKeyGetter: (ctx) => {
      const raw = ctx.headers?.get('authorization') ?? null
      if (raw && raw.toLowerCase().startsWith('bearer ')) {
        return raw.slice('bearer '.length).trim() || null
      }
      return ctx.headers?.get('x-api-key') ?? raw ?? null
    },
  }),
  twoFactor(),
  passkey({ rpName: 'SocialHub' }),
  magicLink({
    sendMagicLink: async ({ email, url }) => {
      devLog('magicLink', { email, url })
    },
  }),
  emailOTP({
    sendVerificationOTP: async ({ email, otp, type }) => {
      devLog('emailOTP', { email, otp, type })
    },
  }),
  haveIBeenPwned({
    customPasswordCompromisedMessage:
      'This password has appeared in a known breach. Pick something different.',
  }),
  multiSession(),
  ...(captchaSiteKey && captchaSecretKey
    ? [
        captcha({
          provider: 'cloudflare-turnstile',
          secretKey: captchaSecretKey,
        }),
      ]
    : []),
  tanstackStartCookies(),
]

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
      apikey: schema.apikey,
      twoFactor: schema.twoFactor,
      passkey: schema.passkey,
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
  plugins,
})

export type Auth = typeof auth
