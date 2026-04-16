## STAGE 56 — Custom PDF analytics reports

Branded, downloadable analytics report covering a date range. Designed
for agencies sharing results with clients.

### Approach

Generate an HTML report server-side, convert to PDF via a headless
approach. Options:
- **Lightweight**: render HTML + inline CSS → return as
  `Content-Type: application/pdf` using a library like `pdf-lib` or
  `jsPDF` with autoTable.
- **High-fidelity**: use Puppeteer/Playwright to screenshot the HTML.

For v1 use `jsPDF` + `jspdf-autotable` (no browser binary needed in
prod). The report is a server fn that returns a PDF blob.

### Scope

1. **Report builder** — `buildAnalyticsReport(slug, range, options)`
   in `app/server/reports.server.ts`. Pulls the same data as the
   analytics page (summary, follower series, platform table, top
   posts, heatmap) and renders into a PDF with:
   - Cover page: workspace name + logo + date range
   - Summary cards (followers, reach, impressions, engagements)
   - Per-platform table
   - Top 5 posts with engagement numbers
   - Heatmap as a table grid
2. **Route** — `/api/reports/analytics?workspaceSlug=...&range=30d`
   returns the PDF with `Content-Disposition: attachment`.
3. **UI** — Analytics page gains a "Download report" button.

### Acceptance

- Click "Download report" on the analytics page → browser downloads
  a PDF named `analytics-<workspace>-<date>.pdf`.
- PDF contains the workspace branding, summary stats, platform
  breakdown, and top posts.
