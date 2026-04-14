## STAGE 13 — Team Management + Approval Workflow

### Page: `/{workspaceSlug}/team`

**Members table**:
- Avatar · full name · email · role badge · date joined · role edit dropdown · Remove button
- Role badges: Admin (purple) · Manager (blue) · Editor (green) · Viewer (gray)
- Role edit dropdown: only visible to Admins and Managers; cannot downgrade yourself
- Remove: confirmation modal; cannot remove yourself

**Role permissions matrix**:

| Action | Admin | Manager | Editor | Viewer |
|---|---|---|---|---|
| View all content | ✓ | ✓ | ✓ | ✓ |
| Create/edit posts | ✓ | ✓ | ✓ | ✗ |
| Delete posts | ✓ | ✓ | ✗ | ✗ |
| Approve posts | ✓ | ✓ | ✗ | ✗ |
| Manage team | ✓ | ✓ | ✗ | ✗ |
| Manage settings | ✓ | ✗ | ✗ | ✗ |
| Delete workspace | ✓ | ✗ | ✗ | ✗ |

**Pending invitations section** (below members table):
- Email · role · invited date · "Resend" · "Cancel" buttons

"Invite Member" button → modal: email input + role selector → sends invite email.
Invited user clicks link → login or register → auto-joins workspace with that role.

**Approval Workflow section** (below pending invitations):
- Toggle: "Require approval before publishing" (updates `workspaces.requireApproval`)
- When enabled:
  - Approver multi-select: choose which Manager/Admin members are approvers
    (saves to `workspace_approvers`)
  - "Notify approvers by email" toggle

**Approval flow in the composer**:
If `workspace.requireApproval = true` AND current user role is `editor`:
- "Schedule" and "Publish Now" buttons replaced by "Submit for Approval"
- Post saves with `status: 'pending_approval'`
- All workspace approvers receive a notification + email (if enabled)

**Pending Approval tab in Posts list** (for users with approve permission):
Each pending post row expands to show:
- Full content preview (or reshare source + quote comment)
- Post Activity Timeline: chronological log of all `post_activity` records for this post
  (each: user avatar + name · action label · timestamp · note if any)
- "Approve" button → `status = 'scheduled'` (or `status = 'publishing'` if "Publish Now" was intent) · notify author
- "Request Changes" button → modal with note textarea → `status = 'draft'` · notify author with note

---

