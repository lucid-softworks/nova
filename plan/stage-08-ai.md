## STAGE 8 — AI Assist

### AI Assist slide-over panel

Triggered by the ✨ button in the composer content editor toolbar.
Opens as a slide-over from the right (preview panel collapses to icon-only mode to make room).

**Sections**:

Generate from scratch:
- Textarea: "Describe what you want to post about..."
- Platform context label: auto-filled ("Optimising for: X, Instagram")
- Tone selector (chips): Professional / Casual / Funny / Persuasive / Inspirational
- Length selector (chips): Short / Medium / Long
- "Generate ✨" button → calls server function, streams response

Improve existing text (only shown if composer textarea has content):
- Six action buttons in a grid:
  - "Make it shorter"
  - "Make it more engaging"
  - "Fix grammar & spelling"
  - "Add relevant hashtags"
  - "Change tone →" (opens tone chip selector)
  - "Rewrite completely"
- Each button streams a new version

Generated output area:
- Streaming text with animated blinking cursor
- After completion: "Use this" button, "Try again" button, "Copy" button
- Session history: all generations stacked vertically, each with a "Use this" button
- "Use this" replaces the active version tab's textarea content

Hashtag suggestions (shown after any generation):
- "Suggest hashtags" button
- Calls a separate server function → returns 10–15 hashtags as clickable chips
- Clicking a chip appends it to the active textarea

**Server function `generateCaption`**:
- Uses `@ai-sdk/anthropic` with `streamText`
- System prompt includes:
  - Platform constraints (character limits, best practices per selected platform)
  - Workspace name (for brand context)
  - Selected tone + length
  - Existing content if improving
- Stream back to client

**For campaign steps**:
AI Assist also available in each step's content editor.
If the step has a dependency, system prompt adds:
"This post will be published after [Step N] which posts to [Platform].
The user may reference the original post URL via variables."

**For reshare quote comments** (Stage 9):
AI Assist available in the quote comment textarea.
System prompt addition: "You are writing a comment to accompany a reshare of this post: [sourceContent preview]"

---

