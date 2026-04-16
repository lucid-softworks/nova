## STAGE 57 — Instagram Stories scheduling

We already publish Reels (Stage 27). Stories use the same container
flow but with `media_type=STORIES`.

### Scope

1. **Composer** — add a "Story" toggle when Instagram is selected.
   When on, the post is flagged as a story in platformVariables
   (`ig_media_type=STORIES`).
2. **Publisher** — in `app/server/publishing/original/instagram.ts`,
   read `platformVariables.ig_media_type`. When `STORIES`:
   - Create container with `media_type=STORIES` + `image_url` or
     `video_url` (stories require media).
   - Stories don't support captions in the API — content is ignored
     but stored for internal reference.
   - Poll status → publish.
3. **Validation** — stories require exactly one image or video.
   Show a warning in the composer if the user toggles Story mode
   without media.

### Acceptance

- Toggle "Story" on an Instagram post with one image → publish →
  appears as a Story on Instagram.
- Attempting to publish a text-only story shows a validation error.
