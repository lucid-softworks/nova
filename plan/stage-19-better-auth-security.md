## STAGE 19 — Better Auth security plugins

Wire the Better Auth plugins we should have had from day one.

### Plugins to add

- **twoFactor()** — TOTP + backup codes; enforce for admins optionally
- **passkey()** — WebAuthn so users can skip passwords entirely
- **magicLink()** — passwordless sign-in by email
- **emailOTP()** — 6-digit code as a second path (magic link alternative)
- **haveIBeenPwned()** — reject registrations with pwned passwords
- **captcha()** — Turnstile / hCaptcha on signup + password reset
- **multiSession()** — lets one browser hold multiple user sessions; useful
  if we add workspace-level user switching later

### Scope

1. `lib/auth.ts`: add the plugins with sensible defaults
2. **/register** flow:
   - HIBP check (server rejects with a friendly code)
   - Captcha widget above Create account button
3. **/login** flow:
   - "Sign in with passkey" button
   - "Sign in with magic link" link → sends email OTP or link
4. **/settings/security** (new page, or tab on /settings/account which we
   don't have yet):
   - Enable 2FA: shows QR + backup codes
   - List + revoke passkeys
   - List + revoke active sessions (one-click log out everywhere)
5. Middleware guard: if a workspace admin has 2FA **required** at the
   workspace level, block sign-in of admin members until enrolled

### Watch-outs

- Captcha needs a provider (Turnstile keys) — gate behind `CAPTCHA_SITE_KEY`
  env vars so dev still works without them
- Magic link + email OTP depend on the mailer (see Stage 22); wire both in
  the same pass so the button isn't dead
- `haveIBeenPwned()` needs network egress at signup time; degrade gracefully
  when the service is down (don't block registration)

### Acceptance

- Real user signs up → HIBP + Captcha run, pwned passwords get rejected
- Real user enables 2FA → next login prompts for TOTP
- Passkey add + login via passkey works in Chrome + Safari
- Magic link arrives via email (Stage 22 dependency) and signs user in
