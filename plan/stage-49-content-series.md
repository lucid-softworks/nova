## STAGE 49 — Content-series templates

Pre-built calendar skeletons (e.g. "Product launch week", "Monthly
content mix") that generate a batch of draft posts with placeholder
content on a schedule grid.

### Scope

- `content_series_templates` table (name, description, slots jsonb)
- Slots: `[{dayOffset, timeOfDay, contentHint, platforms}]`
- "Use template" action creates N draft posts spaced per the slots
- Settings → Templates tab gains a "Series" section
- Ship 3 built-in templates (launch week, weekly mix, daily tips)
