## STAGE 45 — Fix Bluesky publisher PDS resolution

The publisher + reshare adapters hardcode `bsky.social` as the PDS.
Users on other PDS hosts (e.g. `cordyceps.us-west.host.bsky.network`)
get 502s when publishing. Same fix pattern as the backfill/inbox: resolve
the user's PDS from their DID document via plc.directory.

### Scope

- `app/server/publishing/original/bluesky.ts` — resolve PDS, use for
  all xrpc calls + session refresh
- `app/server/publishing/reshare/bluesky.ts` — same
- Use entryway (`bsky.social`) for AppView-proxied calls (createRecord
  is PDS-native so it goes direct)

### Acceptance

- Publishing a post from a non-bsky.social account succeeds.
