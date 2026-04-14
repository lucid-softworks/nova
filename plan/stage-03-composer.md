## STAGE 3 — Post Composer (Core — Standard Mode, Draft Saving)

### Page: `/{workspaceSlug}/compose`

**Mode toggle** at top of page (segmented control):
```
[ Standard Post ]  [ Campaign ]
```
Switching modes clears the composer with a confirmation dialog if content exists.

---

### Standard Post Mode

**"Start from" selector** (shown first, before any content):
```
( ) Shared content — one base, platform overrides via versions
( ) Independent per platform — each platform is a blank slate
```

**Shared content sub-mode**:

Left panel (~60%):

Platform + Account selector:
- Row of toggle buttons, one per connected account
- Each button: platform color background, account avatar, handle
- Character limit of the most-restrictive selected platform shown below
- Shows "No accounts connected" with link to `/accounts` if none exist

Post Versions tab bar (above content editor):
- "Default" tab always present (the shared base)
- "＋ Add Version" button → dropdown to select which platforms to override
- Each version tab shows platform icons for what it covers
- A platform can only belong to one version at a time
- Tab header shows a red ⚠ icon if that version has a media mismatch

Content editor (per active version):
- Auto-growing textarea (min-height 160px)
- Toolbar row below textarea:
  - 😊 Emoji picker (popover with emoji grid, search input)
  - `#` Hashtag groups picker (popover listing saved groups, click to append at cursor)
  - `{}` Variables menu: inserts `{date}` `{time}` `{day}` `{month}` `{year}` at cursor
  - ✨ AI Assist (stub in Stage 3 — shows "Coming in Stage 7")
  - Character counter: "143 / 280" — red when over limit
- First Comment section (collapsible, only shown if ≥1 selected platform supports it):
  - Toggle label: "Add first comment"
  - Textarea for first comment content
- Thread mode toggle (shown if ≥1 selected platform supports threads):
  - When enabled: replaces single textarea with multiple connected boxes
  - Each box: textarea + delete button
  - "＋ Add part" button below last box
  - Drag handle to reorder parts (@dnd-kit)

Media zone (below content editor):
- Drag-and-drop zone with dashed border
- "Upload files" button + "Open Media Library" button (stub in Stage 3)
- Uploaded files show as thumbnail row
- Each thumbnail: file name on hover, ✕ to remove
- Upload progress bar per file
- **Media mismatch detection**: on each upload and on each platform selection change,
  validate against platform `mediaRequirements`. If mismatch detected on any platform:
  - Show a `MediaMismatchBanner` on that platform's version tab:
    ```
    ⚠ This video is 16:9 but TikTok requires 9:16.
    [Upload a different file for TikTok]  [Remove TikTok from this post]
    ```
  - Tab header shows red ⚠
  - "Schedule" and "Publish Now" buttons disabled until resolved
  - "Save Draft" still allowed

**Independent per platform sub-mode**:
- No "Default" tab — each selected platform gets its own tab immediately
- Each tab: full independent editor (text, media, post type, first comment, thread mode)
- No inheritance between tabs
- "Copy from [platform]" button on each tab: dropdown of other platform tabs → copies content

**Reddit-specific fields** (shown when Reddit account selected, in that platform's tab or version):
- Post title input (required, max 300 chars)
- Subreddit input with autocomplete (from `social_accounts.metadata.subscribedSubreddits`)
- Post type: Text / Link / Image / Video
- NSFW toggle, Spoiler toggle

Right panel (~40%) — live preview:
- Platform tabs: one per selected platform
- Each tab renders a mock card styled like that platform:
  - **X**: white card, rounded, avatar + name + handle, tweet text, engagement icons
  - **Instagram**: phone frame, top bar, image placeholder (grey box), caption, hashtags in blue
  - **LinkedIn**: white card, avatar, name + "1st", post text, reaction bar
  - **Facebook**: white card, avatar, name + timestamp, post text, image, reactions
  - **Tumblr**: blog name header, post content styled as Tumblr post
  - **Reddit**: subreddit header, upvote/downvote, title, content
  - **Others**: generic branded card with platform color header
- Updates live on every keystroke
- Shows character count + "over limit" warning per platform

**Bottom action bar**:
- "Save Draft" button (always enabled, even with mismatch warnings)
- "Discard" button (confirmation if content exists)

**Save Draft server function**:
- Validate all content with Zod
- Create `posts` record (`type: 'original'`, `status: 'draft'`)
- Create `post_versions` records
- Create `post_activity` record (`action: 'created'`)
- Redirect to `/{workspaceSlug}/posts` with success toast

---

