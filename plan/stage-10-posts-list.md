## STAGE 10 — Posts List

### Page: `/{workspaceSlug}/posts`

**View mode toggle** (top right): "Flat view" | "Grouped view"

**Tabs**: All / Scheduled / Published / Drafts / Pending Approval / Failed / Queue
Each tab shows count badge.

**Filter bar**:
- Platform multi-select (platform icon toggles)
- Type filter chips: All / Original / Reshare
- Label multi-select
- Author dropdown (workspace members)
- Date range picker (applies to `scheduledAt` or `publishedAt`)
- Search input (searches content + `sourceAuthorHandle` for reshares)

---

### Flat view (default)

One row per post (original and campaign steps shown individually).

**Columns**: checkbox · thumbnail/icon · content + badges · platforms · status · author · date · actions

Content cell:
- For original posts: content preview (2 lines truncated)
- For reshares: "↻ Reshare" type badge + "from @sourceHandle" + source content preview
- For campaign steps: 🎯 campaign name chip + "Step N" label (clicking chip → Campaign Detail)
- If post has ≥2 versions: "＋N versions" chip

**Actions menu (`...`)**:
- Edit → opens composer pre-filled
- Duplicate → draft copy
- Reschedule → inline date/time picker
- Add to Queue
- Delete (confirmation)
- View on platform (if published, links to live post URL)

**Bulk actions bar**:
- Delete selected (confirmation)
- Add label (tag input)
- Change to Draft
- Reschedule (date picker applies to all)
- Retry (for failed posts)

---

### Grouped view

Standalone posts (no `campaignId`): shown as normal rows.
Campaign posts: collapsed into one campaign row per campaign.

Campaign row:
```
┌──────────────────────────────────────────────────────────────┐
│ 🎯 Product Launch Week         [on_hold badge]  [2/4 done]  │
│    Oct 18 · 4 steps · YouTube TikTok X Tumblr               │
│    ▶ Expand steps                          [... actions]    │
└──────────────────────────────────────────────────────────────┘
```

Expanding shows each step as a sub-row (indented), with its own status, platforms, trigger info, and action menu.

Campaign row `...` actions:
- View Campaign Detail
- Edit Campaign (opens composer in Campaign mode, pre-filled)
- Pause Campaign (sets all `waiting` steps to `on_hold`)
- Cancel Campaign (cancels all non-published steps, confirms first)
- Duplicate Campaign (draft copy of entire campaign)

**On-hold campaigns** pinned to top of list with yellow banner:
```
⚠ "Product Launch Week" is on hold — Step 2 failed to publish to YouTube.
[View Campaign]  [Retry Step 2]  [Skip Step 2]
```

---

### Campaign Detail page (`/{workspaceSlug}/posts/campaigns/:campaignId`)

**Header**: campaign name, status badge, "Edit Campaign" button, progress bar ("2 of 4 steps published")

**Step timeline** (vertical):
Each step card:
- Step number + platform icons + status badge
- Scheduled / triggered datetime
- Dependency info: "Fires immediately after Step 1 succeeds"
- Expanded content preview
- If published: platform post URL(s) as links
- If failed: error message + "Retry" + "Skip" buttons
- If on_hold: reason + "Retry dependency" / "Skip" / "Trigger now" buttons
- If waiting: "Waiting for Step [N] to succeed"

**Campaign analytics panel** (below timeline or right side):
- Combined totals: Reach, Impressions, Engagements across all steps
- Per-step breakdown table (populated as analytics sync runs)

---

