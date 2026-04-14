## STAGE 16 — Settings

### Page: `/{workspaceSlug}/settings`

Left sub-nav tabs: General · Posting Schedule · Notifications · API & Webhooks · White Label

### General tab
- Workspace name (text input + save button)
- Workspace slug (lowercase + hyphens only, unique validation, save button)
- Logo upload (image, shown as preview circle, updates sidebar)
- Timezone (searchable `<select>` of all IANA timezones)
- Default language (dropdown of supported locales)
- **Danger zone**: "Delete Workspace" button (red, outlined)
  → Confirmation modal requiring user to type the workspace name
  → Deletes all workspace data, redirects to `/onboarding`

### Posting Schedule tab
- Accordion: one section per day of week (Monday–Sunday)
- Each day: list of time slot chips (format "HH:MM"), ✕ to remove each
- Add slot: time input + "Add" button per day
- "Copy Monday to all days" convenience button
- "Save schedule" button (saves all changes at once)
- Preview card: "Your next 5 queue slots: [datetime list]"

### Notifications tab
Table of notification types with two toggles per row: In-app · Email
Saves to `users.notificationPreferences` jsonb column.

### API & Webhooks tab

**API Keys section**:
- Current key shown masked: `sk-••••••••••••••••••••••••••••••1a2b`
- "Reveal" eye toggle (shows full key)
- "Copy" button
- "Regenerate" button → confirmation modal ("This will invalidate your current key") → generates new key, shows once

**Webhooks section**:
- List: URL · events as chips · Active toggle · Delete button
- "Add Webhook" button → modal:
  - HTTPS URL input (validated)
  - Event checkboxes: `post.published` · `post.failed` · `post.scheduled` · `post.approved` · `post.rejected` · `campaign.on_hold`
  - "Test webhook" button → sends `POST` with `{ event: 'test', timestamp }` payload
  - Auto-generated secret (shown once, copy button)
- HMAC signature header: `X-SocialHub-Signature: sha256={hmac}`

### White Label tab
- App name input (replaces "SocialHub" in sidebar for this workspace)
- Logo upload (replaces app logo in sidebar)
- Live sidebar preview (mini version showing the changes in real time)
- Save button

---

