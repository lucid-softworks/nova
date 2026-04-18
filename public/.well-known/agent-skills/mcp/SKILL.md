---
name: nova-mcp
description: Connect to Nova's Model Context Protocol (MCP) server.
---

# Nova MCP Server

Nova exposes an MCP (Model Context Protocol) endpoint that MCP-aware clients
can connect to for future tool / resource access. The endpoint speaks
streamable HTTP + JSON-RPC 2.0 and is discoverable via a server card.

## Server card

```
https://skeduleit.org/.well-known/mcp/server-card.json
```

Returns a card conforming to SEP-1649 with `serverInfo`, `transport`, and
`capabilities`.

## Transport

```
POST https://skeduleit.org/mcp
Content-Type: application/json
```

## Protocol version

```
2024-11-05
```

## Supported methods

| Method | Result |
| --- | --- |
| `initialize` | Handshake — returns `serverInfo` + empty `capabilities` (tools / resources / prompts namespaces exist but are not populated yet). |
| `tools/list` | `{ tools: [] }` — no tools exposed yet. |
| `resources/list` | `{ resources: [] }`. |
| `prompts/list` | `{ prompts: [] }`. |
| `ping` | `{}`. |

## Example

```sh
curl -X POST https://skeduleit.org/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.0"}}}'
```

## Roadmap

A proper tool surface over Nova's REST API is planned. In the meantime, agents
that need real work should use the REST API directly (see the `nova-rest-api`
skill).
