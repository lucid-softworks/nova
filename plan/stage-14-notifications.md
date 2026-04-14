## STAGE 14 — Notifications

### Notification bell (top bar)

- Badge: red dot with unread count (up to "99+")
- Click → dropdown panel (max-height 500px, scrollable):
  - "Notifications" header + "Mark all read" button
  - List newest first
  - Each item: type icon · title (bold) · body · relative time · unread = blue left border
  - Click item → mark as read + navigate to relevant page
  - "View all" link at bottom (could go to a full `/notifications` page)

**Notification types and triggers**:

| Type | Trigger | Who is notified |
|---|---|---|
| `post_published` | BullMQ worker success | Post author |
| `post_failed` | BullMQ worker failure (all retries exhausted) | Post author |
| `approval_requested` | Editor submits for approval | All workspace approvers |
| `post_approved` | Approver approves | Post author |
| `post_rejected` | Approver requests changes | Post author |
| `member_joined` | Invited user accepts invite | Workspace admins |
| `campaign_on_hold` | Campaign step fails | Post author + workspace admins |

**Email notifications**:
- HTML email templates per type
- Branded with `workspace.appName` and `workspace.logoUrl`
- "View Post" / "View Campaign" CTA button linking back to app
- Unsubscribe link per notification type (stored in user preferences — add `notificationPreferences jsonb` column to `users` table)

**Notification preferences** (Settings → Notifications tab):
- Toggle per notification type: In-app on/off · Email on/off (independent)

**Polling**:
- TanStack Query polls `/api/notifications/unread-count` every 30 seconds
- On new notifications: update badge count, show a toast for the most recent one

---

