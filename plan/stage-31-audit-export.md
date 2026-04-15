## STAGE 31 — Audit log export

Stage 20 added per-post activity rows; Stage 27 surfaced them at
`/activity`. For compliance workflows users want to export this as
CSV or JSON filtered by date range and actor.

### Scope

1. **Filters on the activity UI**: date range (from/to) + actor picker
   (any member). Backend `listWorkspaceActivityImpl` grows matching
   optional params.
2. **Export**:
   - `exportWorkspaceActivity(slug, { from, to, userId, format })`
     server fn returns a `Response` with the appropriate Content-Type.
   - CSV columns: `timestamp,action,actor,postId,postContent,note`.
   - JSON: array of the same shape (omit `postContent` truncation).
3. **UI**: two buttons in the activity page header — CSV / JSON — that
   trigger a browser download.

### Acceptance

- Filter to "last 7 days, posts by Luna", export — CSV opens in Excel
  cleanly and the rows match the on-screen list.
- A 10,000-row export streams out without the server OOMing.
