## AUTHENTICATION

### App login (Better Auth)
Configure in `lib/auth.ts`:
- Email + password with email verification
- Google OAuth (app login only)
- GitHub OAuth (app login only)
- Session management with workspace context injected via middleware

Middleware (`middleware.ts`) must:
1. Redirect unauthenticated users to `/login`
2. On dashboard routes: extract `workspaceSlug` from URL, verify the current user is a member of that workspace, inject workspace + member role into server context
3. Return 403 if user is not a member of the requested workspace

### Social platform connections (Better Auth genericOAuth)
Use Better Auth's `genericOAuth` plugin for all 12 social platforms.

In the shared OAuth callback handler (`server/oauth/callback.ts`):
1. Extract the current session to get `userId` + `workspaceId`
2. Call the platform's `/me` endpoint to get `accountName`, `handle`, `avatarUrl`
3. Encrypt `accessToken` and `refreshToken` using `lib/encryption.ts` (AES-256-GCM)
4. Upsert a record in `social_accounts`
5. Redirect to `/{workspaceSlug}/accounts?connected={platform}` with a success toast

**Special cases:**
- **Bluesky**: Not OAuth — show a modal with username + app password fields. Store app password as `accessToken` (encrypted). Use AT Protocol (`@atproto/api`) for all API calls.
- **Mastodon**: Instance-specific OAuth. First prompt for instance URL (e.g. `mastodon.social`). Dynamically register the app with that instance, then begin standard OAuth flow. Store instance URL in `social_accounts.metadata.instanceUrl`.
- **Tumblr**: OAuth 1.0a — use `oauth-1.0a` package. Sign every request with consumer key/secret + access token/secret.
- **Reddit**: Standard OAuth2. On connect, immediately fetch and store the user's subscribed subreddits in `social_accounts.metadata.subscribedSubreddits`.

**Token refresh:**
Before every platform API call, check if `tokenExpiresAt < now + 1 hour`. If so, attempt refresh → update `social_accounts`. If refresh fails, set `status = 'expired'` and create a notification for the user.

---

