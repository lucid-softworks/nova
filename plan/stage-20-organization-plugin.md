## STAGE 20 — Evaluate / migrate to Better Auth's Organization plugin

We built our own workspace + membership + approval machinery in Stage 1
(`workspaces`, `workspace_members`, `workspace_approvers`, custom invite
flow that only works for existing users). Better Auth's **Organization**
plugin ships equivalents + an invitation flow + teams + access-control out
of the box.

### Why

- Battle-tested invitation emails (see Stage 13's deferred work)
- Team support for free (we might not need it but it's a no-cost option)
- Role + permission matrix via `createAccessControl`, with typed helpers
  instead of our ad-hoc role checks scattered across `*.server.ts`
- Organization-scoped sessions: `auth.getSession()` surfaces the active
  organization so every server fn doesn't have to re-resolve the workspace

### The catch

This touches a lot of code. We reference `workspaces` / `workspace_members`
from almost every server module: posts, campaigns, scheduling, media,
reshare, analytics, notifications, team. Migrating means:

1. Drop `workspace_members` + `workspace_approvers` in favour of the
   plugin's `member` + (custom) `approver` relation
2. Keep our `workspaces` table for the domain-specific columns
   (`appName`, `logoUrl`, `timezone`, `requireApproval`) — link it 1:1 to
   the plugin's `organization` row
3. Every `requireWorkspaceAccess` call becomes a session lookup with an
   `activeOrganizationId` filter
4. Role checks shift from string literals to the plugin's access-control
   types

### Scope (if we decide to do it)

1. Install plugin with our role list: admin / manager / editor / viewer
   (approver is additive, stored on our `workspaceApprovers` or the
   plugin's `member.roles[]`)
2. Generate + run migration that either joins or replaces our tables
3. Adapt `server/session.server.ts` to pull `activeOrganization` from the
   Better Auth session; keep `withSessionOverride` for API callers
4. Sweep every `*.server.ts` impl that currently calls
   `requireWorkspaceAccess` — replace with the new helper
5. Rebuild the invite flow on top of the plugin's `invite/accept/reject`
   endpoints so non-existing users can be invited by email (closes Stage
   13's deferred email-invite gap)
6. Update Team page to use the plugin's endpoints

### Decision point

Worth doing if:
- We're about to add teams / nested permissions
- We need real email invitations (we do — see Stage 22)
- We want SSO / SCIM later (Stage 28 below depends on this)

Not worth doing if:
- We stay single-team-per-workspace forever
- We don't mind keeping the invitation flow as "existing users only"

Write this up and discuss before starting. It's the single largest
refactor on the roadmap.
