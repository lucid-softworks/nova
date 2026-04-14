## STAGE 11 — Calendar

### Page: `/{workspaceSlug}/calendar`

**Controls bar**: Month | Week toggle · ← Prev · Today · Next → · "New Post" split button

### Monthly view

7-column grid, 5–6 rows.

Day cell:
- Day number (top-right)
- Post pills (up to 4 shown):
  - Original: left border = first platform's brand color · content preview · time · status dot
  - Reshare: left border color · "↻" prefix + source handle · time · status dot
  - Campaign step: "🎯" prefix + campaign name · time · status dot
- "+N more" chip → popover listing remaining posts for that day
- Clicking empty area → opens composer with that date pre-filled

Clicking a post pill → **quick-view popover**:
- Content or reshare source preview
- Platform icons, status badge, scheduled time
- For campaign steps: link to Campaign Detail
- Actions: Edit, Delete, Reschedule

**Drag and drop** (`@dnd-kit/core`):
- Drag any post pill to another day
- Visual drop indicator on target day
- On drop: update `scheduledAt` to same time on new date (preserve time)
- Campaign steps can be dragged to reschedule only if they have no dependency,
  or if their dependency is also being moved

### Weekly view

7 columns (Mon–Sun), hourly rows (00:00–23:59).
Posts as cards in their time slot. Overlapping posts stack.
Click card → same quick-view popover.
Click empty slot → composer with date+time pre-filled.

---

