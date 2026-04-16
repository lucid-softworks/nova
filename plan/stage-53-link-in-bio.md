## STAGE 53 — Link-in-bio page

A customisable landing page at `/bio/<handle>` showing recent posts
and custom links. Each workspace gets one bio page; the handle is the
org slug by default but can be overridden.

### Schema

```
bio_pages(
  id uuid PK,
  workspaceId uuid NOT NULL → workspaces UNIQUE,
  handle text NOT NULL UNIQUE,
  displayName text,
  avatarUrl text,
  bio text,
  theme text DEFAULT 'default',       -- 'default' | 'dark' | 'minimal'
  links jsonb DEFAULT '[]',           -- [{title, url, icon?}]
  showRecentPosts boolean DEFAULT true,
  recentPostCount integer DEFAULT 6,
  createdAt timestamp
)
```

### Scope

1. **CRUD server fns** — `getBioPage`, `upsertBioPage`
2. **Public route** — `/bio/:handle` renders the page (no auth). Pulls
   recent published posts + the custom links. SEO-friendly with
   og:title/description meta tags.
3. **Settings UI** — Settings → new "Bio Page" tab with handle,
   display name, avatar, bio text, theme picker, link list editor
   (drag-to-reorder), toggle for recent posts.
4. **i18n** keys for the settings tab.

### Acceptance

- Visit `/bio/acme` — see the workspace's avatar, bio, links, and
  recent posts in a clean single-column layout.
- Edit the bio page from settings → changes reflect immediately.
