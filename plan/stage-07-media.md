## STAGE 7 — Media Library

### Page: `/{workspaceSlug}/media`

**Layout**: Two panels — folder tree sidebar (200px) + asset grid.

**Folder tree sidebar**:
- "All Media" root (always shown, selected by default)
- Workspace folders as a nested tree
- "＋ New Folder" button at top
- Right-click or `...` menu per folder: Rename, Delete (with confirmation)
- Clicking a folder filters the asset grid

**Asset grid**:
- Uniform grid, size toggle: Small / Medium / Large
- Each asset card: thumbnail, filename (truncated), file size, type badge (IMAGE/VIDEO/GIF)
- Hover state: checkbox appears top-left, "Insert" button bottom-left, `...` menu top-right
- Multi-select: clicking checkbox enters select mode; clicking elsewhere in card also selects
- "Select all" checkbox in top bar when in select mode

**Top bar**:
- Search input (searches by `originalName`)
- Filter chips: All / Images / Videos / GIFs
- Sort: Date uploaded ↓ / Date uploaded ↑ / Name / Size
- "Upload" button
- Bulk actions bar (visible when ≥1 selected): "Move to folder" dropdown, "Delete" button

**Upload**:
- Drag files anywhere on the page (full-page drop zone)
- Multi-file browser via Upload button
- Each uploading file shows as a placeholder card with progress bar
- On complete: generate thumbnail (Sharp for images, first-frame extraction for video)
- Save to `storage/{workspaceId}/{filename}` (local) or S3 (prod)
- Insert `media_assets` record

**Preview modal** (click any asset):
- Left: full-size image or `<video controls>`
- Right panel: filename, type, dimensions/duration, size, upload date, uploader name
- Actions: "Insert into Post" (if opened from composer context), Download, Move to folder, Delete

**Composer integration** ("Open Media Library" button in Stage 3):
- Opens as a full-height slide-over from the right
- Same grid UI, but "Insert" buttons say "Select"
- Multi-select → "Insert Selected (N)" button at bottom → closes slide-over, adds to composer media zone

---

