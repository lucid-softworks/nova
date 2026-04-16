## STAGE 39 — Saved replies

Canned responses the team can insert when replying from the inbox.
Shared per-workspace so everyone uses the same voice.

### Schema

```
saved_replies(
  id uuid PK,
  workspaceId uuid NOT NULL → workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  shortcut text,           -- optional slash-command style trigger e.g. "/thanks"
  createdById text → user(id) ON DELETE SET NULL,
  createdAt timestamp
)
```

### Scope

1. **CRUD server fns** — `listSavedReplies`, `createSavedReply`,
   `updateSavedReply`, `deleteSavedReply`.
2. **Settings → Saved Replies tab** — table of replies with
   title/content/shortcut, inline edit, delete.
3. **Inbox insert** — the composer opened from Reply gains a small
   "Saved replies" popover (magnifying glass icon next to the text
   area) that filters by title/shortcut and inserts the content at
   cursor.

### Acceptance

- Create "Thanks for reaching out" reply → click Reply in inbox →
  open saved-replies picker → select it → content appears in the
  composer.
- Shortcut `/thanks` filters the list to that one entry.
