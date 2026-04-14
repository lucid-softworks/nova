## STAGE 17 — REST API + Webhook Delivery

### Authentication
All `/api/v1/` routes accept either:
- `Authorization: Bearer {apiKey}` — looks up `api_keys` table, injects workspace
- Session cookie — standard Better Auth session

Rate limiting: 100 req/min per API key (use `@upstash/ratelimit` + Redis).

### Endpoints

```
POST   /api/v1/posts              Create post (original or reshare)
GET    /api/v1/posts              List (?status, ?type, ?platform, ?from, ?to, ?limit, ?offset)
GET    /api/v1/posts/:id          Get post + versions + activity
PATCH  /api/v1/posts/:id          Update post
DELETE /api/v1/posts/:id          Delete post

POST   /api/v1/campaigns          Create campaign
GET    /api/v1/campaigns          List campaigns
GET    /api/v1/campaigns/:id      Get campaign + steps
DELETE /api/v1/campaigns/:id      Delete campaign

POST   /api/v1/media              Upload (multipart/form-data)
GET    /api/v1/media              List assets
DELETE /api/v1/media/:id          Delete asset

GET    /api/v1/accounts           List connected social accounts
GET    /api/v1/analytics          Summary (?from, ?to, ?accountId, ?campaignId)
```

All responses:
```json
{ "data": { ... }, "meta": { "total": 0, "page": 1, "limit": 20 } }
// or
{ "error": { "code": "POST_NOT_FOUND", "message": "Post not found" } }
```

### Webhook delivery

On triggering event:
1. Find all `webhooks` for workspace where `events` contains the event and `isActive = true`
2. Build payload: `{ event, timestamp, data: { post/campaign, workspace } }`
3. Sign: `HMAC-SHA256(secret, JSON.stringify(payload))` → header `X-SocialHub-Signature: sha256={hash}`
4. `POST` to webhook URL (10s timeout)
5. Save to `webhook_deliveries`
6. On failure: retry 3× (delays: 30s, 2min, 10min)

---

