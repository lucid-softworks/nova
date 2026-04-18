import { createFileRoute } from '@tanstack/react-router'

/**
 * Minimal MCP (Model Context Protocol) endpoint over streamable-http
 * transport. Handles initialize + the three list methods with empty
 * inventories so an agent that discovers the server-card.json can
 * connect, negotiate protocol, and see we expose nothing yet. Once
 * there's a real tool set to expose, flesh out tools/list + tools/call.
 *
 * Spec: https://spec.modelcontextprotocol.io/
 */

const PROTOCOL_VERSION = '2024-11-05'
const SERVER_INFO = { name: 'Nova', version: '0.0.0' }

type JsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: unknown
}

function rpc(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

async function dispatch(body: JsonRpcRequest): Promise<unknown> {
  switch (body.method) {
    case 'initialize':
      return rpc(body.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: SERVER_INFO,
      })
    case 'initialized':
    case 'notifications/initialized':
      // Notification — JSON-RPC notifications don't get a response.
      return null
    case 'tools/list':
      return rpc(body.id, { tools: [] })
    case 'resources/list':
      return rpc(body.id, { resources: [] })
    case 'prompts/list':
      return rpc(body.id, { prompts: [] })
    case 'ping':
      return rpc(body.id, {})
    default:
      return rpcError(body.id, -32601, `Method not found: ${body.method ?? '(none)'}`)
  }
}

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: async () =>
        new Response('MCP endpoint — use POST with a JSON-RPC body', {
          status: 405,
          headers: { Allow: 'POST', 'Content-Type': 'text/plain' },
        }),
      POST: async ({ request }) => {
        let body: JsonRpcRequest
        try {
          body = (await request.json()) as JsonRpcRequest
        } catch {
          return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 })
        }
        const response = await dispatch(body)
        if (response === null) {
          // Notification — respond 202 Accepted with no body per JSON-RPC 2.0.
          return new Response(null, { status: 202 })
        }
        return Response.json(response, {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
