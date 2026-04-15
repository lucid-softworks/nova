## STAGE 30 — PWA polish

Make the dashboard installable on mobile / desktop as a Progressive Web
App.

### Scope

1. `public/manifest.webmanifest` with name, icons, start URL,
   theme/background matching the light and dark palettes.
2. PNG icons at 192 and 512 + an SVG maskable icon under
   `public/icons/`.
3. Minimal service worker (`public/sw.js`) that caches the app shell
   (`/`, `/login`, static assets from `/assets/**`) using a
   stale-while-revalidate strategy, and serves an offline fallback page.
4. Register the service worker from `__root.tsx` after hydration, gated
   on `'serviceWorker' in navigator`.
5. Add `<link rel="manifest">` + theme-color meta tags from the head
   config.

### Non-goals

- Offline post composition (the API is the source of truth; allowing
  writes offline invites sync hell).
- Push notifications (separate stage; needs platform-side plumbing).

### Acceptance

- Chrome shows an Install icon; installing opens the app in standalone
  mode.
- Lighthouse PWA audit passes the "Installable" checks.
- Dropping the network, hitting refresh returns the offline fallback
  instead of a connection error.
