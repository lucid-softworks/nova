## STAGE 48 — Internationalisation (i18n)

Wrap every user-facing string in the app with a translation helper.
Ship English (en) and French (fr) as the first two locales.

### Approach

Use a lightweight runtime translation function — no heavy i18n
framework. A simple `t(key, params?)` that reads from a flat
`Record<string, string>` per locale. The active locale is stored in
`localStorage` and exposed via React context.

### Scope

1. **Translation infrastructure**:
   - `app/lib/i18n/index.ts` — `t(key)` function, `useLocale()` hook,
     `LocaleProvider` context, `setLocale(code)` persistence
   - `app/lib/i18n/en.ts` — English strings (source of truth)
   - `app/lib/i18n/fr.ts` — French translations

2. **Wrap every UI string** — every `.tsx` file under `app/routes` and
   `app/components` that renders user-facing text. Covers:
   - Page titles, headings, descriptions
   - Button labels, form labels, placeholders
   - Toast messages, error messages, empty states
   - Settings labels, nav items, tab labels
   - Admin panel
   - Auth pages (login, register, forgot password)

3. **Locale switcher** — small dropdown in the TopBar (or next to the
   theme toggle) showing the current language flag/code, clicking
   switches and persists.

4. **Server-rendered strings** — for SSR, the locale is read from a
   cookie so the first paint matches. The `LocaleProvider` hydrates
   from the cookie on the client.

### What stays in English

- Log messages (pino output)
- API error codes
- Platform names (Bluesky, Mastodon, etc.)
- Env var names and technical identifiers

### Acceptance

- Switch to French → every page renders in French.
- Switch back to English → everything back.
- Refreshing preserves the choice.
- No English strings leak through in French mode (audit the major
  pages: login, compose, posts, calendar, analytics, settings, inbox,
  admin).
