## STAGE 58 — Security hardening

Full-application security audit produced 23 findings across auth,
injection, config, and data-access surfaces. This stage fixes them
in priority order.

### P0 — Critical

1. **Auth on `/api/ai/hashtags`** — endpoint has zero auth, zero rate
   limiting, zero Zod validation. Anyone on the internet can consume
   Anthropic credits. Add `authenticateApiRequest` + `rateLimit` +
   a Zod input schema.
   `app/routes/api/ai/hashtags.ts`

2. **BETTER_AUTH_SECRET empty-string fallback** — digest HMAC uses
   `process.env.BETTER_AUTH_SECRET ?? ''`. If the var is unset the
   token is trivially forgeable. Replace with `requireEnv()` or
   import the validated value from the auth module.
   `app/server/digests/build.ts:7`
   `app/server/digests/unsubscribe.server.ts:6`

3. **API v1 PATCH has no runtime validation** — body is cast with
   `as` instead of Zod. Attacker can set `status` to `published` /
   `failed` / `publishing`, or inject extra fields into the `.set()`
   call. Add a strict Zod schema and whitelist settable fields.
   `app/routes/api/v1/posts.$id.ts:60-89`

4. **Approval portal skips status check** — `approvePostViaTokenImpl`
   and `requestChangesViaTokenImpl` never verify
   `post.status === 'pending_approval'`. A reviewer with a valid token
   can force-schedule any post (draft, published, failed). Add the
   guard.
   `app/server/approvalPortal.server.ts:196-205, 235`

### P1 — High

5. **SSRF on RSS, webhooks, Mastodon** — user-supplied URLs are
   fetched server-side with no private-IP blocking. Add a shared
   `safeFetch` helper that resolves DNS first and rejects
   RFC 1918 / link-local / loopback / cloud-metadata addresses.
   Apply to:
   - `app/server/rss/poll.ts:17`
   - `app/server/settings.server.ts:270` (webhook delivery)
   - `app/server/accounts.server.ts:130-151` (Mastodon instance)

6. **AI billing bypass** — `aiAssistEnabled` flag exists in billing
   limits but is never checked. Gate `/api/ai/generate` and
   `/api/ai/hashtags` behind `limitsFor(workspace).aiAssistEnabled`.
   `app/routes/api/ai/generate.ts`
   `app/server/ai.server.ts`
   `app/lib/billing/limits.ts:23`

7. **No RBAC on v1 mutations** — any workspace member (including
   `viewer`) can POST / PATCH / DELETE posts via the v1 API. Check
   `auth.ctx.role` and require `editor` or above for mutations.
   `app/routes/api/v1/posts.ts`
   `app/routes/api/v1/posts.$id.ts`

8. **No rate limiting on auth endpoints** — login, register,
   forgot-password, magic-link, OTP have zero rate limiting.
   Add per-IP rate limits (e.g. 10 req/min) to auth routes.
   `app/routes/_auth/`

9. **No security headers** — add middleware in `server-entry.js`
   setting Content-Security-Policy, X-Frame-Options (DENY),
   X-Content-Type-Options (nosniff), Referrer-Policy
   (strict-origin-when-cross-origin), Permissions-Policy.

10. **File upload has no size or MIME restrictions** — entire file
    buffered into memory with no limit, any MIME type accepted.
    Add a max size (e.g. 50 MB), MIME allowlist (image/*, video/*,
    application/pdf), and set Content-Disposition: attachment on
    S3 uploads.
    `app/server/composer.server.ts:15-28`
    `app/routes/api/media/upload.ts`

### P2 — Medium

11. **Enable email verification** — set
    `requireEmailVerification: true` and `sendOnSignUp: true`.
    Prevents account squatting and invitation hijacking.
    `app/lib/auth.ts:210-216`

12. **OAuth callback session re-verification** — callback trusts
    the encrypted state cookie unconditionally. Re-verify the user
    has an active session and workspace access before saving the
    social account.
    `app/routes/api/oauth/callback/$platform.ts:36-101`

13. **In-memory rate-limiter fallback** — when Redis is down the
    limiter falls back to an in-memory Map with a silent catch.
    Log a warning when degrading and consider rejecting requests
    (fail closed) instead of silently dropping limits.
    `app/server/apiAuth.ts:169-207`

14. **Encrypt 2FA secrets at rest** — TOTP secrets and backup codes
    sit in plaintext in the `twoFactor` table. Use `encrypt()` on
    write and `decrypt()` on read, same as social account tokens.
    Also encrypt Better Auth `account` table tokens.
    `app/server/db/schema.ts:195-196, 169-170`

15. **Validate ENCRYPTION_KEY at startup** — currently lazy. Add an
    eagerly-evaluated check in `server-entry.js` or a top-level
    import that throws before the server binds.
    `app/lib/encryption.ts:8-15`

16. **Escape LIKE wildcards in search** — user input interpolated
    into LIKE/ILIKE without escaping `%` and `_`. Write a small
    `escapeLike()` helper and apply it.
    `app/server/media.server.ts:149-150`
    `app/server/posts.server.ts:56-61`

17. **Switch export endpoints to POST** — GET endpoints that return
    sensitive data relying only on session cookies are vulnerable to
    CSRF-style data exfiltration. Switch to POST or add CSRF tokens.
    `app/routes/api/posts/export.ts`
    `app/routes/api/activity/export.ts`
    `app/routes/api/reports/analytics.ts`

### P3 — Low

18. **Bio page links: reject non-HTTP schemes** — validation uses
    `z.string().max(2000)` instead of `.url()`. A `javascript:` URI
    can be stored and rendered in `<a href>`. Restrict to
    `http:` / `https:`.
    `app/server/bioPage.ts:69`

19. **Short link redirect: restrict schemes** — `new URL()` accepts
    `javascript:` and `data:` URIs. Reject non-HTTP schemes before
    storing.
    `app/lib/shortener/providers/local.ts:57`

20. **Calendar feed token expiry** — token never expires and leaks
    post content via URL. Add an expiration (e.g. 90 days) and
    support regeneration.
    `app/server/calendarFeed.server.ts`

21. **Seed file NODE_ENV guard** — `password123` with no env check.
    Gate behind `NODE_ENV === 'development'`.
    `app/server/db/seed.ts:9`

22. **Docker Compose: bind to localhost** — Postgres and Redis
    exposed on 0.0.0.0. Change to `127.0.0.1:5432:5432` and
    `127.0.0.1:6379:6379`.
    `docker-compose.yml:10,22`

23. **safeDecrypt silent failure** — returns empty string on
    decryption failure, masking key rotation issues. Log a warning
    and return a sentinel that callers can check.
    `app/server/queues/worker.ts:327-334`

### Acceptance

- `/api/ai/hashtags` returns 401 without a valid session
- Digest unsubscribe tokens cannot be forged with an empty HMAC key
- PATCH `/api/v1/posts/:id` with `{"status":"published"}` returns 400
- Approval endpoint rejects posts not in `pending_approval` status
- RSS feed URL pointing to `http://169.254.169.254` is rejected
- Free-plan user calling `/api/ai/generate` gets a 403
- Viewer-role API key cannot create or update posts
- 10+ rapid login attempts from one IP get rate-limited
- Response headers include CSP, X-Frame-Options, X-Content-Type-Options
- Uploading a 200 MB file returns 413; uploading an `.html` file is rejected
- Email verification is required before session is granted
- Bio page link with `javascript:alert(1)` is rejected on save
