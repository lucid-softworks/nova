## STAGE 1 — Scaffold + Auth + App Shell

> **Stop after this stage and check in.**

### 1a. Project setup
- Create TanStack Start project with TypeScript
- Install all dependencies listed in the tech stack
- Configure Drizzle ORM + PostgreSQL connection
- Write the complete Drizzle schema (`server/db/schema.ts`) — all tables defined above
- Generate and run initial migration
- Create `.env.example` with all variables above
- Set up `pnpm typecheck` and `pnpm lint` scripts

### 1b. Better Auth
- Configure Better Auth in `lib/auth.ts` with email/password, Google, GitHub
- Mount handler at `app/routes/api/auth/$.ts`
- Create `lib/encryption.ts` — AES-256-GCM encrypt/decrypt functions for OAuth tokens
- Write auth middleware
- Seed script: `pnpm db:seed` creates one test user (`test@example.com` / `password123`) and one workspace

### 1c. Auth pages
Route group: `app/routes/_auth/` — clean centered layout, no sidebar, no nav.

Pages:
- `/login` — email/password form + "Continue with Google" + "Continue with GitHub" buttons
- `/register` — name, email, password, confirm password
- `/verify-email` — "Check your inbox" with resend button
- `/forgot-password` — email input
- `/reset-password` — new password + confirm (requires valid token in URL)

All forms: React Hook Form + Zod validation, shadcn/ui components, field-level inline errors, loading spinner on submit.

### 1d. Onboarding flow
Route: `/onboarding` — shown to users with no workspaces after first login.

Step 1: Workspace name + slug
- Name input (required)
- Slug: auto-generated from name (lowercase, hyphens), editable
- Validate slug is URL-safe and unique

Step 2: Invite team members
- Email input + role selector (repeatable, add/remove rows)
- "Skip for now" link

Step 3: Confirmation
- "You're all set!" with a "Go to dashboard" button

On completion: create workspace + workspace_members record for owner, redirect to `/{slug}/compose`.

Subsequent logins with existing workspaces: redirect to last active workspace (store in session or cookie).

### 1e. App shell layout
Route group: `app/routes/_dashboard/$workspaceSlug/` — all dashboard pages share this layout.

**Sidebar** (256px wide, `#0f1117` background, white text):

Top section:
- App logo + name: uses `workspace.appName` if set (white label), otherwise "SocialHub"
- Logo: uses `workspace.logoUrl` if set, otherwise default app icon

Workspace switcher (below logo):
- Shows current workspace name + first letter avatar
- Dropdown lists all workspaces the user belongs to
- "Create new workspace" option at bottom → `/onboarding`
- Clicking a workspace navigates to `/{slug}/compose`

Navigation (grouped, with section labels):

```
PUBLISH
  Compose      (PenSquare icon)
  Posts        (LayoutList icon)
  Calendar     (CalendarDays icon)

LIBRARY
  Media        (Image icon)
  Templates    (FileText icon)

INSIGHTS
  Analytics    (BarChart2 icon)

MANAGEMENT
  Accounts     (Link icon)
  Team         (Users icon)
  Settings     (Settings icon)
```

Active state: pill highlight with primary color (`#6366f1`).
Hover state: subtle background highlight.

Bottom section:
- User avatar (initials fallback) + name + email
- Logout button

Mobile (< 768px): sidebar hidden by default, hamburger button in top bar reveals it as an overlay.

**Top bar** (full width, white, border-bottom):
- Page title (dynamic, set by each page)
- "New Post" split button:
  - Primary: opens composer in Standard mode
  - Dropdown arrow → "Queue Reshares" → opens Reshare Browser slide-over
- Notification bell icon with unread count badge (red dot, count up to 99+)

**Main content area**: `#f8f9fb` background, `p-6`, scrollable, `max-w` container.

**Placeholder pages**: Every route under `_dashboard` that isn't implemented yet renders a card saying "Coming soon — [Page Name] (Stage X)". Use consistent placeholder layout.

**URL routing**: `/` and `/{workspaceSlug}` both redirect to `/{workspaceSlug}/compose`.

### Definition of done for Stage 1:
- [ ] `pnpm dev` starts without errors
- [ ] Can register a new account, verify email, complete onboarding, and land on the dashboard
- [ ] Can log in with Google and GitHub
- [ ] Sidebar nav renders, workspace switcher works, all placeholder pages load
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes
- [ ] All schema tables exist in the database after running migrations
- [ ] Commit: `feat: stage 1 — scaffold, auth, app shell`

---

