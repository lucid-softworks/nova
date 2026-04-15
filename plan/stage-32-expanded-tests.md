## STAGE 32 — Expanded test coverage

Stage 27 landed 18 tests. Many of the highest-risk areas are still
uncovered. This stage focuses on the ones where a regression would be
both likely and expensive.

### Add suites for

- **Every publisher's error mapping** — 401/403/429/413/400 + generic
  5xx → correct `PublishError` code + retryable flag. Fetch mocked.
  One test file per platform (12 total) with a small shared helper.
- **Analytics adapters** — extend existing suite to cover the
  remaining 9 platforms (facebook, instagram, threads, linkedin, reddit,
  tumblr, pinterest, youtube, tiktok).
- **Campaign worker dependency resolution** — `onStepComplete` +
  `skipStep` + `triggerStepNow` with mocked DB.
- **Billing limit math** — `limitsFor` + `usageFor` + `assertWithinLimit`
  end-to-end with a sqlite-memory drizzle instance.
- **Short link mint + resolve** — collision retry, dedup, click counter
  increment.

### Non-goals

- Integration tests that require Postgres or Redis — out of scope for
  `pnpm test`. Those belong in CI with dockerised services (future).

### Acceptance

- `pnpm test` runs in under 10s locally.
- Each publisher has at least 4 error-path assertions.
- Coverage (informational, not gated) passes 40% of `app/server/**`.
