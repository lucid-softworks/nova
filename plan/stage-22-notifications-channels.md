## STAGE 22 — Notification channels: email + push (brrr.now) + per-user prefs

In-app notifications from Stage 14 land in the bell dropdown. Email is
deferred across the plan (Stage 14 + 22 of the original plan). This stage
adds:

- Email notifications via an actual mailer
- **iOS push notifications via brrr.now** — webhook-based push to
  iPhone/iPad ([brrr.now docs](https://brrr.now/docs/))
- Per-user preferences controlling which events fire on which channel

### brrr.now overview

- REST-only; `POST https://api.brrr.now/v1/{secret}` with JSON body
- Auth by the path secret (or `Authorization: Bearer <secret>`)
- Payload fields: `message` (required), `title`, `subtitle`, `open_url`,
  `image_url`, `thread_id`, `sound`, `expiration_date`, `filter_criteria`,
  `interruption_level`
- One shared webhook per user covers all their devices; per-device secrets
  are available if we want device targeting later

### Schema

- `user.notification_preferences jsonb` — per-event toggle map:
  ```json
  {
    "post_published":      { "inApp": true,  "email": true,  "push": false },
    "post_failed":         { "inApp": true,  "email": true,  "push": true  },
    "approval_requested":  { "inApp": true,  "email": true,  "push": true  },
    "post_approved":       { "inApp": true,  "email": true,  "push": false },
    "post_rejected":       { "inApp": true,  "email": true,  "push": false },
    "member_joined":       { "inApp": true,  "email": false, "push": false },
    "campaign_on_hold":    { "inApp": true,  "email": true,  "push": true  }
  }
  ```
- `user.brrr_webhook_secret text` — encrypted per user (lib/encryption).
  A "Connect brrr.now" button in Settings → Notifications walks the user
  through getting their secret from the brrr.now app and pasting it.
- Sensible defaults for new users; prefs row is auto-created on first read.

### Mailer

- Pick one provider and wire via a single `server/mailer.server.ts` with a
  `sendEmail({ to, subject, html })` function
- Candidates: **Resend** (cleanest DX, good free tier), AWS SES, Postmark.
  Default to Resend; env-gate the API key and log-fall-through in dev when
  the key isn't set

### Templates

- HTML email templates per notification type, branded with
  `workspace.appName` + `workspace.logoUrl` (already on our schema)
- Minimal styling, single primary CTA (View Post / View Campaign)
- Unsubscribe link that deep-links to Settings → Notifications and
  disables that specific event's email toggle

### Dispatch

Extend `server/notifications.server.ts`:

```
notifyUser(params) now:
  1. Insert the in-app row (existing behavior) if user.prefs.inApp
  2. If user.prefs.email  → mailer.sendEmail(...)
  3. If user.prefs.push   && user.brrr_webhook_secret
     → POST https://api.brrr.now/v1/{secret} with payload mapped to their
       fields (title/message/open_url to the relevant page)
  All three run in parallel, failures logged but don't block each other.
```

### UI

Settings → Notifications (currently stubbed):
- Table of events × channel toggles (matches the jsonb shape above)
- "Connect brrr.now" card at the top:
  - "Paste your brrr.now secret" textbox + Test Push button
  - Shows connected state + masked secret once saved
- Save button writes back to `user.notification_preferences`

### Acceptance

- Toggle `approval_requested.email = true` on an admin account → when an
  editor submits for approval, the admin receives an HTML email with the
  post preview and an "Approve" CTA deep-linking to the posts list
- Toggle `post_published.push = true` + paste brrr.now secret → publish
  completes → iPhone buzzes
- Turning off an event's in-app toggle hides that row from the bell
  dropdown
- Unsubscribe link in an email disables only that specific event's email
  channel for that user

### Watch-outs

- The bell dropdown already hides-on-read but we'll want a dedicated
  `/notifications` page too (tracked separately) once email + push
  generate more volume
- Webhook retries on brrr.now: if the POST fails, queue a retry via
  BullMQ with the same 30s / 2m / 10m backoff we use for outbound
  webhooks (Stage 17)
