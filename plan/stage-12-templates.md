## STAGE 12 — Templates + Hashtag Groups

### Page: `/{workspaceSlug}/templates`

Two tabs: **Templates** | **Hashtag Groups**

### Templates tab

Grid of template cards:
- Template name, content preview (3 lines), platform icons
- "Use Template" → opens composer pre-filled with content + platform targets
- `...` menu → Edit, Delete

"Create Template" button → modal with simplified composer:
- Template name (required)
- Content textarea
- Platform selector (which platforms this template is for)
- Save → insert into `templates`

Edit: same modal pre-filled.
Delete: confirmation modal.

### Hashtag Groups tab

List layout. Each group row:
- Group name · count badge · preview of first 5 hashtags as chips
- Click row to expand and see all hashtags
- `...` → Edit, Delete

"Create Group" button → modal:
- Group name (required)
- Textarea: one hashtag per line or space-separated (with or without `#`)
- Live preview: parsed hashtags shown as chips below textarea
- Save → insert into `hashtag_groups`

**Composer integration** (wires up the stub from Stage 3):
- `#` hashtag groups picker fetches real groups from DB for the current workspace
- Click a group → appends all its hashtags at the current cursor position in the active textarea

---

