## STAGE 7b — Media Library Deduplication

Uploads currently write every file to disk even if the same bytes are already
stored. Dedupe at the workspace level so re-uploading the same file links to
the existing `media_assets` row and skips the second disk write.

### Schema

- Add `content_hash text` column to `media_assets`
- Add a composite index on `(workspace_id, content_hash)` — not unique, since
  hash computation can fail (legacy rows) and we want the lookup to be fast

### Upload flow

1. Read the incoming file into a buffer (already done)
2. Compute `sha256(buf).hex()`
3. `SELECT * FROM media_assets WHERE workspace_id = ? AND content_hash = ? LIMIT 1`
4. If a row exists: return it (no new insert, no new file on disk). The UI is
   indistinguishable from a first-time upload.
5. Otherwise: write the file to disk and insert a new row with `content_hash`
   populated.

### Delete flow

- Before unlinking the file on disk, confirm no other rows in the workspace
  reference the same `content_hash`. Only unlink if this was the last
  reference, to keep dedup safe.

### Backfill

Existing rows have `content_hash IS NULL`. They stay that way and don't
participate in dedup — acceptable since the workspace only has a handful of
dev uploads. If we ever need full dedup coverage, a one-shot backfill script
can compute hashes for `content_hash IS NULL` rows.

---
