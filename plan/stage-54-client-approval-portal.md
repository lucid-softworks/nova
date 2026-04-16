## STAGE 54 — Client approval portal

External reviewers (clients, stakeholders who aren't workspace members)
can approve or request changes on pending posts via a magic link.
No account required.

### Schema

```
approval_tokens(
  id uuid PK,
  workspaceId uuid NOT NULL → workspaces,
  email text NOT NULL,
  name text,
  token text NOT NULL UNIQUE,        -- random 32-char base64url
  expiresAt timestamp NOT NULL,
  createdById text → user,
  createdAt timestamp
)
```

### Scope

1. **Generate link** — team page or approvals page: "Invite external
   reviewer" button. Creates a token row, copies a URL like
   `/review/:token`.
2. **Public review route** — `/review/:token` shows pending_approval
   posts for that workspace (no login needed). Each post has
   Approve / Request Changes buttons. Actions write to the existing
   `approvePostImpl` / `requestChangesImpl` path (attributed to the
   external reviewer's name+email in post_activity).
3. **Settings** — manage active review links (revoke, see who has
   access).
4. **Expiry** — tokens expire after 7 days by default; configurable.

### Acceptance

- Generate a review link → open in incognito → see pending posts →
  approve one → post status changes to scheduled.
- Revoking the token → the link 404s.
