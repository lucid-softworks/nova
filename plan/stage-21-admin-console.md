## STAGE 21 — Admin console (Better Auth admin plugin)

Nothing today gives a platform operator a view across workspaces. When
support tickets come in we have to SQL. Better Auth's `admin()` plugin
gives us user impersonation, role assignment, and a banned-state flag —
wrap it in a small internal console.

### Scope

1. Add `admin()` plugin to `lib/auth.ts`; mark the first user in the DB as
   role 'admin' via a seed tweak
2. New route group `/admin` (separate from workspace-scoped routes) guarded
   by the plugin's `isAdmin()` check
3. Pages:
   - `/admin/users` — list, search, ban/unban, impersonate
   - `/admin/workspaces` — list, open as admin, delete
   - `/admin/jobs` — BullMQ queue status (waiting / active / failed / delayed),
     retry or drain a failed job
   - `/admin/webhooks` — all `webhook_deliveries` across workspaces with
     filters on success + event
4. Impersonation banner fixed to the top of the app when a support user is
   acting as another user ("You are impersonating alice@… · Exit")

### Acceptance

- Platform admin can log in, switch to `/admin`, impersonate a user, help
  them, then exit cleanly
- Failed BullMQ jobs can be retried from the UI
- A support user banned at `/admin/users` can't sign in
