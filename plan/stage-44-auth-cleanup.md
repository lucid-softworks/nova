## STAGE 44 — Auth cleanup: remove social login

Google/GitHub OAuth on the login page was wired for app authentication,
but social OAuth is only meant for connecting platform accounts (Stage 2).
Users should sign in with email/password, magic link, passkey, or email
OTP — not by linking their Google/GitHub identity to their app account.

### Scope

1. **Login page** — remove the Google + GitHub buttons and the `oauth`
   helper.
2. **Register page** — same removal if present.
3. **auth.ts** — remove the `socialProviders` block. Google/GitHub
   client IDs are only used for platform-account OAuth via the
   separate `providers.server.ts` registry — they don't need to be
   in Better Auth's config.
4. **.env.example** — move `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   and `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` under the "Social
   platform OAuth" section (they were under "App login OAuth").

### What stays

- Email + password (primary)
- Magic link
- Passkey
- Email OTP
- 2FA (TOTP) — setup in Settings → Security
- Captcha (Turnstile) — stays on the sign-up endpoint

### Acceptance

- Login page shows email/password, magic link, passkey — no Google,
  no GitHub.
- Register page same.
- Existing users who signed up via Google/GitHub can still sign in via
  email/password (Better Auth creates an email+password credential
  alongside the social one).
