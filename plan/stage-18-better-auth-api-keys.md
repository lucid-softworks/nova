## STAGE 18 — Migrate to Better Auth's API Key plugin

We shipped Stage 17's `/api/v1/*` with a homegrown API key system:
`api_keys` table, SHA-256 hash on write, `Authorization: Bearer sk_...` check
in `server/apiAuth.ts`. Better Auth ships an official plugin that does this
properly — scoped keys, per-key rate limits, rotation, and a settings UI.

### Why

- **Built-in rate limiting per key**, not just per workspace
- **Scoped keys** (e.g. read-only keys) without rolling our own
- **Rotation + expiration** handled by the plugin
- **Revocation is audit-logged** alongside sessions

### Scope

1. Install + configure `apiKey()` plugin in `lib/auth.ts`
2. Drop `api_keys` table + the custom schema entries; migrate any existing
   keys (currently dev-only, safe to wipe)
3. Replace `server/apiAuth.ts` Bearer path with Better Auth's key verification
   (the plugin exposes a verify function; it can live inside the same
   `authenticateApiRequest` helper so callers don't change)
4. Settings → API tab now creates/lists/revokes via Better Auth's endpoints
   instead of our `createApiKeyImpl` + friends
5. Keep the session-cookie path and `withSessionOverride` unchanged —
   bridge between API callers and session-based impls still works

### Acceptance

- `GET /api/v1/posts` with a Better-Auth-issued key still returns the same
  envelope
- Rotating a key invalidates old requests with 401
- Settings UI list + create + revoke round-trip
- `apiAuth.ts` is ~100 lines shorter; `api_keys` table drops from schema
