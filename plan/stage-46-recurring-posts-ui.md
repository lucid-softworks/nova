## STAGE 46 — Recurring posts UI

Stage 40 built the backend (schema, CRUD, cron worker). This stage adds
the missing UI: a "Repeat" dialog on the Posts page that lets users
create/manage recurring rules from a draft.

### Scope

- Dialog with cron presets (daily, weekdays, weekly, monthly, custom)
- Timezone picker
- Account selector (which accounts get the cloned posts)
- List of active recurring rules with pause/delete
- Badge on recurring source posts in the posts list
