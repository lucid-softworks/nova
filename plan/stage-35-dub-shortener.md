## STAGE 35 — Dub link shortener + Better Auth integration

Our current link-shortener (Stage 27 polish) mints 6-char slugs in a
local `short_links` table and serves them from `/l/:slug`. That's
fine for internal use but lacks analytics, branded domains, QR codes,
A/B testing, and the per-workspace attribution that a commercial
shortener gives you. Dub covers all of that and has an official
Better Auth plugin.

### Scope

1. **Shortener abstraction** — `app/lib/shortener/` mirrors the
   billing-provider pattern:
   - `ShortenerProvider` interface: `shorten(ctx, targetUrl) →
     {url, slug, externalId}`, `resolve(slug) → targetUrl | null`
     (local driver only), `stats(externalId) → ClickStats` (optional).
   - Providers: `local` (our existing `/l/:slug` flow) and `dub`.
   - Selector via `SHORTENER_PROVIDER=local|dub`. Default `local`.

2. **Dub provider** — `app/lib/shortener/providers/dub.ts`:
   - Uses `dub` SDK with `DUB_API_KEY`.
   - `shorten` calls `dub.links.create({ url, domain?, key? })`;
     returns the Dub-hosted `shortLink`.
   - `stats` calls `dub.analytics.retrieve({ linkId, event: 'clicks' })`
     — fed by the `ShortLinkStats` server fn for admin debugging.
   - `resolve` is a no-op (Dub owns the redirect).

3. **Schema touch** — `short_links.externalId TEXT NULLABLE` so we can
   store a Dub link id when the provider is `dub`. Same table serves
   both providers; nothing changes for rows minted under `local`.

4. **Better Auth Dub plugin** — `@dub/better-auth`. Optional, engaged
   only when `DUB_API_KEY` is set. Tags newly-signed-up users with
   their workspace id so Dub's attribution pipeline can credit
   click-throughs back to the right team.

5. **UI** — no change. The existing `/posts` short-link affordance
   calls `shortenUrl` which now dispatches to the selected provider.

### Env

```
SHORTENER_PROVIDER=local   # or 'dub'
DUB_API_KEY=               # required for dub provider + BA plugin
DUB_DOMAIN=                # optional: custom short domain (else dub.sh)
DUB_WORKSPACE_ID=          # optional: scope links to a specific workspace
```

### Acceptance

- Setting `SHORTENER_PROVIDER=dub` + a `DUB_API_KEY` makes
  `shortenUrl` return a `dub.sh` (or custom-domain) URL instead of
  `/l/:slug`.
- Unsetting falls back to local — no data migration needed.
- Better Auth users created while Dub is configured show up in the
  Dub dashboard's customers panel with their workspace id as
  `externalId`.
