---
name: nova-rest-api
description: Read and schedule social media posts in Nova via the v1 REST API.
---

# Nova REST API

Workspace-scoped REST surface for reading and creating posts, campaigns, media,
and analytics data on behalf of a user's workspace. Fully documented via an
OpenAPI 3.1 spec.

## Base URL

```
https://skeduleit.org/api/v1
```

## Authentication

API keys are issued per workspace under **Settings → API & Webhooks**. Send the
key as a bearer token on every request:

```
Authorization: Bearer <api-key>
```

Keys are rate-limited to 100 requests/minute per workspace. Over the limit, the
response is HTTP 429 with a `Retry-After` header.

## OpenAPI spec

The machine-readable spec lives at:

```
https://skeduleit.org/api/v1/openapi/json
```

Load it into any OpenAPI-aware tool (Postman, Insomnia, openapi-generator, or
the MCP openapi tooling) to get typed bindings for every endpoint.

## Primary resources

| Resource | Endpoints |
| --- | --- |
| Posts | `GET /posts`, `POST /posts`, `GET/PATCH/DELETE /posts/{id}` |
| Campaigns | `GET /campaigns`, `GET /campaigns/{id}` |
| Media | `GET /media`, `DELETE /media/{id}` |
| Accounts | `GET /accounts` |
| Analytics | `GET /analytics` |

## Webhooks

Nova will POST to any URL you register under **Settings → API & Webhooks** on
`post.published`, `post.failed`, `post.scheduled`, `post.approved`,
`post.rejected`, and `campaign.on_hold`. Deliveries are signed with HMAC-SHA256
using your webhook secret (`X-Nova-Signature: sha256={hmac}`).

## Errors

Errors are returned as JSON with shape:

```json
{ "error": "Human-readable message" }
```

Common statuses: `400` invalid input, `401` missing / invalid key, `403`
workspace access denied, `429` rate limited, `500` server error.
