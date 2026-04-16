## STAGE 52 — Apply pending schema migrations

Not a code stage — operational task. Run `pnpm db:push --force` to
apply all tables and columns added since Stage 25:

- `recurring_posts`
- `saved_replies`
- `workspaces.calendar_feed_token`
- `workspaces.utm_defaults`
- `user.digest_opt_in` (already applied manually)

### Acceptance

- `pnpm db:push --force` completes without error.
- All new features that depend on these tables work end-to-end.
