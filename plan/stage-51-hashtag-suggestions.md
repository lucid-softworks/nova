## STAGE 51 — Hashtag suggestions via AI

Wire the existing AI Assist panel to suggest contextually relevant
hashtags based on the post content.

### Scope

- "Suggest hashtags" button in the composer toolbar (next to the
  existing AI Assist button)
- Calls the Anthropic API with the post content + selected platforms,
  asks for 5-10 relevant hashtags
- Returns them as clickable chips; clicking appends to the content
- Respects per-platform hashtag conventions (# on most, none on
  Bluesky which uses inline links)
