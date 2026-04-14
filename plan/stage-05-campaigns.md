## STAGE 5 — Campaign Mode in Composer

### Campaign mode UI

Activated by the mode toggle at the top of the composer page.

**Campaign header**:
- Campaign name input (required, placeholder "e.g. Product Launch Week")
- Autosaves the name as user types

**Campaign step builder** (vertical timeline):

Each step is a card with a connector line to the next:

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1                                          [✕ Remove]  │
├─────────────────────────────────────────────────────────────┤
│ Platforms: [YouTube ▼] [TikTok ▼]   [+ Add platform]       │
│ Schedule:  📅 Oct 18 2025  🕐 12:00pm  [Change]            │
│ Start from: (●) Shared  ( ) Independent                     │
│                                                              │
│ [▼ Edit content for this step]                              │
└─────────────────────────────────────────────────────────────┘
         │
         │ (dependency connector)
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2                                          [✕ Remove]  │
├─────────────────────────────────────────────────────────────┤
│ Platforms: [X/Twitter ▼]   [+ Add platform]                 │
│ Depends on: [Step 1 ▼]                                      │
│ Trigger:   (●) Immediately when Step 1 succeeds             │
│            ( ) [____] minutes after Step 1 succeeds         │
│            ( ) At scheduled time: [date/time] (if Step 1    │
│                                    succeeded by then)        │
│                                                              │
│ [▼ Edit content for this step]                              │
└─────────────────────────────────────────────────────────────┘

[+ Add Step]
```

**Expanded step content editor**:
Same as standard composer content editor (textarea, toolbar, media zone, versions/tabs)
but scoped to this step's platforms only.

**Available variables for dependent steps**:
When a step has a dependency, the content editor toolbar shows an "Insert URL Variable" button.
Clicking it shows a popover listing variables available from prior steps:
```
{step1_youtube_url}   — YouTube URL from Step 1
{step1_tiktok_url}    — TikTok URL from Step 1
```
Only variables from platforms that have `supportsUrlVariable: true` are listed.

**Save actions (campaign mode)**:
- "Save Campaign Draft" → creates `campaigns` record + `campaign_steps` + `posts` for each step (all `status: 'draft'`)
- "Schedule Campaign" → validates all steps (checks for media mismatches, missing content), saves all with `status: 'scheduled'`

**Validation before scheduling**:
- Campaign name required
- At least 1 step
- Each step has at least 1 platform selected
- No unresolved media mismatches on any step
- Step 1 (or any step with `dependsOnStepId = null`) must have a `scheduledAt` set

---

