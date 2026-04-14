## STAGE 2 — Social Account OAuth Connections

### Page: `/{workspaceSlug}/accounts`

**Layout**: page header ("Connected Accounts") + "Add Account" button + account list.

**Account list**:
- Grouped by platform (collapsible accordion sections)
- Each account row:
  - Platform icon (brand color circle)
  - Avatar (or initials fallback)
  - Account name + handle (`@handle`)
  - Status badge: Connected (green dot), Expired (yellow dot), Disconnected (red dot)
  - "Last synced" timestamp
  - If `tokenExpiresAt < now + 7 days`: yellow warning chip "Token expiring soon"
  - Action buttons: "Reconnect" (if expired/disconnected) or "Disconnect"
- Empty state per platform section: "No [Platform] accounts connected"

**"Add Account" modal**:
- Grid of all 12 platform buttons with brand colors and icons
- Platforms that already have ≥1 connected account show a small "+" badge
- Clicking a platform initiates the OAuth flow (or shows the special modal for Bluesky/Mastodon)
- Bluesky modal: username + app password inputs → save button
- Mastodon modal: instance URL input → "Continue" → standard OAuth redirect

**Disconnect**: confirmation modal → set `status = 'disconnected'`, null the tokens.

**OAuth scopes per platform**:
- Facebook: `pages_manage_posts pages_read_engagement pages_show_list`
- Instagram: `instagram_basic instagram_content_publish instagram_manage_insights`
- X: `tweet.read tweet.write users.read offline.access`
- LinkedIn: `w_member_social r_organization_social r_liteprofile`
- TikTok: `video.publish video.upload user.info.basic`
- YouTube: `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly`
- Pinterest: `pins:read pins:write boards:read`
- Threads: `threads_basic threads_content_publish`
- Tumblr: `write read`
- Reddit: `identity submit read mysubreddits`

---

