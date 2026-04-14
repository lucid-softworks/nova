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
import { sendEmail } from '~/server/mailer.server'

const requireEnv = (key: string): string => {
  const v = process.env[key]
  if (!v) throw new Error(`${key} is required`)
  return v
}

const optionalEnv = (key: string): string | undefined => process.env[key] || undefined

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
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
      await sendEmail({
        to: email,
        subject: 'Your SocialHub sign-in link',
        text: `Sign in to SocialHub:\n\n${url}\n\nThis link expires in 5 minutes.`,
        html: `
          <div style="font-family:system-ui;max-width:480px;margin:24px auto;color:#111">
            <h2 style="margin:0 0 12px">Sign in to SocialHub</h2>
            <p>Click the button below to sign in. This link expires in 5 minutes.</p>
            <p style="margin:20px 0">
              <a href="${escapeHtml(url)}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Sign in</a>
            </p>
            <p style="color:#666;font-size:12px">
              Or paste this link: <br><code>${escapeHtml(url)}</code>
            </p>
          </div>
        `,
      })
    },
  }),
  emailOTP({
    sendVerificationOTP: async ({ email, otp, type }) => {
      await sendEmail({
        to: email,
        subject: `Your SocialHub code: ${otp}`,
        text: `Your verification code is ${otp} (${type}).`,
        html: `
          <div style="font-family:system-ui;max-width:480px;margin:24px auto;color:#111">
            <h2 style="margin:0 0 12px">Verification code</h2>
            <p>Enter this code to ${escapeHtml(type)}:</p>
            <div style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${escapeHtml(otp)}</div>
            <p style="color:#666;font-size:12px">This code expires in 5 minutes.</p>
          </div>
        `,
      })
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
