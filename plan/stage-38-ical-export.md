## STAGE 38 — iCal feed of scheduled posts

Subscribe to scheduled posts from Google Calendar / Apple Calendar /
Outlook. Each scheduled or published post becomes a VEVENT pinned to
its `scheduledAt` time.

### Scope

1. **Schema** — `workspaces.calendarFeedToken text` (unique,
   nullable). Minted on first request to the settings-page "Generate
   feed URL" button. Rotating invalidates prior subscriptions.

2. **Route** — `/api/calendar/:token.ics`:
   - Resolve token → workspace (404 on miss).
   - Pull posts in status ∈ {scheduled, published} with a `scheduledAt`
     or `publishedAt`. Window: last 30 days + next 90.
   - Emit a minimal iCalendar body (`VCALENDAR` + `VEVENT` per post)
     with sensible `SUMMARY` (truncated content), `DESCRIPTION` (full
     content + platform list), `DTSTART`, `UID` keyed on post id.
   - `Content-Type: text/calendar; charset=utf-8`.

3. **UI** — Settings → Schedule tab (exists) grows a "Calendar feed"
   card: shows the current subscription URL, Copy button, Regenerate
   button (warns about invalidating existing subscribers).

### Acceptance

- Paste the URL into Google Calendar → scheduled posts appear as
  events at their scheduled times within ~10 minutes (Google's poll
  cadence, not ours).
- Regenerating rotates the token; the old URL 404s.
- Events use UIDs so re-polling updates existing events rather than
  duplicating.
