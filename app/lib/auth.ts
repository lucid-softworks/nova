import { betterAuth, APIError } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { eq, gte, count } from 'drizzle-orm'
import { apiKey } from '@better-auth/api-key'
import { passkey } from '@better-auth/passkey'
import {
  twoFactor,
  magicLink,
  emailOTP,
  haveIBeenPwned,
  multiSession,
  captcha,
  admin,
  organization,
} from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { db, schema } from '~/server/db'
import { sendEmail } from '~/server/mailer.server'
import { getBillingProvider } from '~/lib/billing'
import { getShortener } from '~/lib/shortener'

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

// Workspace-scoped access control. Keep the four existing roles we've
// been using (admin / manager / editor / viewer). Coarse actions for now
// — enforcement still happens inside each *.server.ts impl where the
// checks are richer than a simple matrix would capture.
const workspaceStatement = {
  post: ['create', 'read', 'update', 'delete', 'publish', 'approve'],
  campaign: ['create', 'read', 'update', 'delete'],
  member: ['invite', 'update', 'remove'],
  settings: ['read', 'update'],
} as const
const workspaceAc = createAccessControl(workspaceStatement)
const workspaceAdmin = workspaceAc.newRole({
  post: ['create', 'read', 'update', 'delete', 'publish', 'approve'],
  campaign: ['create', 'read', 'update', 'delete'],
  member: ['invite', 'update', 'remove'],
  settings: ['read', 'update'],
})
const workspaceManager = workspaceAc.newRole({
  post: ['create', 'read', 'update', 'delete', 'publish', 'approve'],
  campaign: ['create', 'read', 'update', 'delete'],
  member: ['invite', 'update'],
  settings: ['read', 'update'],
})
const workspaceEditor = workspaceAc.newRole({
  post: ['create', 'read', 'update'],
  campaign: ['create', 'read', 'update'],
  settings: ['read'],
})
const workspaceViewer = workspaceAc.newRole({
  post: ['read'],
  campaign: ['read'],
  settings: ['read'],
})

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
  passkey({ rpName: 'Nova' }),
  magicLink({
    sendMagicLink: async ({ email, url }) => {
      await sendEmail({
        to: email,
        subject: 'Your Nova sign-in link',
        text: `Sign in to Nova:\n\n${url}\n\nThis link expires in 5 minutes.`,
        html: `
          <div style="font-family:system-ui;max-width:480px;margin:24px auto;color:#111">
            <h2 style="margin:0 0 12px">Sign in to Nova</h2>
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
        subject: `Your Nova code: ${otp}`,
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
  admin({
    // Platform-admin role (separate from our workspace-role system).
    defaultRole: 'user',
    adminRoles: ['admin'],
  }),
  organization({
    ac: workspaceAc,
    roles: {
      admin: workspaceAdmin,
      manager: workspaceManager,
      editor: workspaceEditor,
      viewer: workspaceViewer,
    },
    creatorRole: 'admin',
    // Email invitations — plugin posts a URL; we wire through sendEmail.
    sendInvitationEmail: async ({ email, invitation, organization, inviter }) => {
      const inviteUrl = `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/accept-invitation?token=${invitation.id}`
      await sendEmail({
        to: email,
        subject: `${inviter.user.name} invited you to "${organization.name}"`,
        text: `You've been invited to join ${organization.name} on Nova.\n\nAccept: ${inviteUrl}\n\nThis invitation expires in 48 hours.`,
        html: `
          <div style="font-family:system-ui;max-width:480px;margin:24px auto;color:#111">
            <h2 style="margin:0 0 12px">You've been invited</h2>
            <p>${escapeHtml(inviter.user.name)} invited you to join <strong>${escapeHtml(organization.name)}</strong> on Nova as a ${escapeHtml(invitation.role ?? 'member')}.</p>
            <p style="margin:20px 0">
              <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Accept invitation</a>
            </p>
            <p style="color:#666;font-size:12px">This invitation expires in 48 hours.</p>
          </div>
        `,
      })
    },
  }),
  ...(captchaSiteKey && captchaSecretKey
    ? [
        captcha({
          provider: 'cloudflare-turnstile',
          secretKey: captchaSecretKey,
        }),
      ]
    : []),
  // Billing: whichever provider is selected via BILLING_PROVIDER contributes
  // its Better Auth plugin if it ships one (Stripe, Polar, Dodo today).
  // Providers without a BA plugin (Autumn, Creem, Chargebee) return null and
  // are driven entirely from the BillingProvider abstraction instead.
  ...(() => {
    const plugin = getBillingProvider().betterAuthPlugin?.()
    return plugin ? [plugin as ReturnType<typeof apiKey>] : []
  })(),
  // Link shortener: Dub's Better Auth plugin tags sign-ups with their
  // workspace for attribution; local provider contributes nothing.
  ...(() => {
    const plugin = getShortener().betterAuthPlugin?.()
    return plugin ? [plugin as ReturnType<typeof apiKey>] : []
  })(),
  tanstackStartCookies(),
]

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: requireEnv('BETTER_AUTH_SECRET'),
  rateLimit: {
    window: 60,
    max: 10,
    customRules: {
      '/sign-in/*': { window: 60, max: 5 },
      '/sign-up/*': { window: 60, max: 5 },
      '/forget-password': { window: 60, max: 3 },
      '/magic-link/*': { window: 60, max: 5 },
      '/email-otp/*': { window: 60, max: 5 },
    },
  },
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
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
      // admin plugin reuses user + session (columns added to existing tables)
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 8,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Verify your Nova email',
        text: `Verify your email: ${url}`,
        html: `
          <div style="font-family:system-ui;max-width:480px;margin:24px auto;color:#111">
            <h2 style="margin:0 0 12px">Verify your email</h2>
            <p>Click the button below to verify your email address.</p>
            <p style="margin:20px 0">
              <a href="${escapeHtml(url)}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Verify email</a>
            </p>
            <p style="color:#666;font-size:12px">
              Or paste this link: <br><code>${escapeHtml(url)}</code>
            </p>
          </div>
        `,
      })
    },
  },
  plugins,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return
      const row = await db.query.platformSettings.findFirst({
        where: eq(schema.platformSettings.id, 'singleton'),
      })
      const enabled = row?.signupsEnabled ?? true
      if (!enabled) {
        throw new APIError('FORBIDDEN', { message: 'Sign-ups are disabled.' })
      }
      const max = row?.signupRateLimitMax ?? null
      const windowHours = row?.signupRateLimitWindowHours ?? 1
      if (max != null && max > 0) {
        const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)
        const [r] = await db
          .select({ n: count() })
          .from(schema.user)
          .where(gte(schema.user.createdAt, since))
        const recent = r?.n ?? 0
        if (recent >= max) {
          throw new APIError('TOO_MANY_REQUESTS', {
            message: 'Sign-up limit reached. Please try again later.',
          })
        }
      }
    }),
  },
})

export type Auth = typeof auth
