## STAGE 41 — Approval queue

Workspaces with `requireApproval=true` today rely on the regular
/posts "Pending" tab and an `approvePostImpl` / `rejectPostImpl` path.
That works but approvers lose it among all their own drafts and
schedules. This stage gives them a dedicated queue view.

### Scope

1. **Route** — `/$workspaceSlug/approvals`. Shows every post in
   status `pending_approval` belonging to the workspace, newest first,
   with the version preview, targets, author, and submission time.

2. **Bulk actions** — multi-select + two buttons:
   - **Approve selected** — calls `approvePostImpl` for each with
     `scheduledAtIso = null` (same "publish in 5s" default the existing
     single-row path uses). Sequential to keep webhook ordering
     predictable.
   - **Request changes** — collects a required note via prompt, calls
     `rejectPostImpl` for each.

3. **Access** — visible only when `workspace.role ∈ {admin, manager}`
   or when the user is in `workspaceApprovers` (Stage 14 scaffolded
   that table). Sidebar entry is gated on the same role check.

4. **Empty state** — "Nothing to approve" with a link back to /posts.

### Out of scope

- Slack / email notifications on new submissions — already covered by
  Stage 22's notification channels.
- Reassigning approvers from this view — that's on the Team page.

### Acceptance

- Editor submits a post → it appears in an admin/manager's /approvals
  within the next loader round-trip.
- Selecting three posts and clicking Approve schedules all three.
- Clicking "Request changes" on a selection prompts once for a note,
  rejects each with that note, post authors get notified via the
  existing rejection path.
