## STAGE 40 — Recurring posts

"Post this every Monday at 9am" — a cron-style schedule attached to
a post template that auto-creates scheduled posts on each tick.

### Schema

```
recurring_posts(
  id uuid PK,
  workspaceId uuid NOT NULL → workspaces(id) ON DELETE CASCADE,
  sourcePostId uuid NOT NULL → posts(id) ON DELETE CASCADE,
  cronExpression text NOT NULL,     -- e.g. "0 9 * * 1"
  timezone text NOT NULL DEFAULT 'UTC',
  socialAccountIds uuid[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  lastFiredAt timestamp,
  nextFireAt timestamp,
  createdById text → user(id),
  createdAt timestamp
)
```

`sourcePostId` is a draft that serves as the template. On each tick
the worker clones its latest default version + platform targets into
a new scheduled post.

### Scope

1. **CRUD server fns** — `listRecurring`, `createRecurring`,
   `updateRecurring`, `deleteRecurring`.
2. **Poller** — new BullMQ repeatable every minute walks rows where
   `active=true AND nextFireAt <= now()`. For each: clone the source
   post, schedule at `nextFireAt`, advance `nextFireAt` to the next
   cron tick via a lightweight cron-parser helper.
3. **UI** — on the Posts page, a "Repeat" action on any draft opens a
   small dialog: cron preset picker (daily, weekdays, weekly, monthly,
   custom), timezone, confirm. Creates the `recurring_posts` row.
4. **Posts list badge** — recurring posts get a small "recurring"
   icon next to their status.

### Out of scope

- Natural-language cron input ("every Tuesday and Thursday") — use
  preset buttons for now; custom lets power users type a raw cron.
- Editing the recurring template from the recurring-posts list — the
  user edits the source draft directly, and the next tick picks it up.

### Acceptance

- Create a recurring post from a draft set to "every Monday 9am UTC"
  → within a minute, a scheduled post appears for the next Monday.
- Deactivating the recurring rule stops new posts from appearing.
- Deleting the source draft cascades and removes the rule.
