## STAGE 42 — UTM parameter builder

Auto-tag links in post content with campaign tracking parameters
before publishing. Each workspace configures defaults; users can
override per-post.

### Scope

1. **Workspace setting** — `workspaces.utmDefaults jsonb` storing
   `{ utm_source, utm_medium, utm_campaign, utm_content, utm_term }`.
   UI on Settings → General.

2. **Per-post override** — `platformVariables.utm_*` on a version
   takes precedence over the workspace default when the publisher
   substitutes links.

3. **Link rewriter** — `app/lib/utm.ts`: exported `appendUtmParams(
   content, params)` walks every `https://` URL in the content and
   appends the non-empty UTM params (idempotent — if the URL already
   has a given param, leave it). Called by the publisher worker just
   before handing content to the platform adapter.

4. **Composer affordance** — a small "UTM" button in the toolbar opens
   a popover showing the five fields, pre-filled from the workspace
   defaults, saved into per-version `platformVariables.utm_*`.

### Acceptance

- Set `utm_source=socialhub` on the workspace → schedule a post with
  a link → published content has `?utm_source=socialhub` appended.
- Override `utm_campaign=launch` per-post → published link carries
  both.
- A link that already has `?ref=x` gets `&utm_source=socialhub`
  without duplicating `ref`.
