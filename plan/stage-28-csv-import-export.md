## STAGE 28 — Bulk CSV import / export

Ship CSV import for rapid backfill (migrating from Buffer / a spreadsheet)
and CSV export for compliance / BI.

### Scope

1. **Import** (`/posts` → "Import CSV" button)
   - Column set: `content,scheduledAt,platforms,accountHandles` (handles
     comma-separated within the cell, pipe-separated across platforms).
   - Server fn `importPostsFromCsv(slug, csvText)` parses rows, resolves
     accounts by handle, creates draft posts with `postPlatforms` rows.
   - On each row failure: skip + collect. Return `{ created, skipped,
     errors: [{row, reason}] }` for UI feedback.

2. **Export** (`/posts` → "Export CSV" button)
   - Honour the current list filters (tab, search, platforms, type).
   - Emits: `id,status,type,scheduledAt,publishedAt,content,platforms,
     accounts`.
   - Streamed via `Content-Type: text/csv` Response, not buffered.

### Acceptance

- Upload a 500-row CSV, get a toast with create/skip counts.
- Export the published tab, open the CSV in Numbers / Excel without
  mojibake (UTF-8 BOM).
- No new tables; everything is derived from existing `posts` state.
