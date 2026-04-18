import { createFileRoute } from '@tanstack/react-router'

// Hand-curated OpenAPI 3.1 doc for /api/v1/*. Better Auth's openAPI()
// plugin covers /api/auth/*; this complements it with the workspace
// surface that external integrations hit via API keys.

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Nova v1 API',
    version: '1.0.0',
    description:
      'Workspace-scoped REST API. Authenticate with an API key issued under Settings → Developer: `Authorization: Bearer <key>`.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      apiKey: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API key',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'object' },
        },
        required: ['error', 'message'],
      },
      PostRow: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['original', 'reshare'] },
          status: {
            type: 'string',
            enum: ['draft', 'scheduled', 'publishing', 'published', 'failed', 'pending_approval'],
          },
          scheduledAt: { type: 'string', format: 'date-time', nullable: true },
          publishedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          authorName: { type: 'string', nullable: true },
          defaultContent: { type: 'string' },
        },
      },
      PostCreate: {
        type: 'object',
        required: ['versions'],
        properties: {
          mode: { type: 'string', enum: ['shared', 'independent'], default: 'shared' },
          socialAccountIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
          versions: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['platforms', 'content'],
              properties: {
                platforms: { type: 'array', items: { type: 'string' } },
                content: { type: 'string' },
                firstComment: { type: 'string', nullable: true },
                isThread: { type: 'boolean' },
                threadParts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      content: { type: 'string' },
                      mediaIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                    },
                  },
                },
                mediaIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                isDefault: { type: 'boolean' },
              },
            },
          },
        },
      },
      PostPatch: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['draft', 'scheduled', 'pending_approval'] },
          scheduledAt: { type: 'string', format: 'date-time', nullable: true },
          labels: { type: 'array', items: { type: 'string' } },
        },
      },
      Asset: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          filename: { type: 'string' },
          originalName: { type: 'string' },
          mimeType: { type: 'string' },
          size: { type: 'integer' },
          url: { type: 'string' },
          thumbnailUrl: { type: 'string', nullable: true },
          width: { type: 'integer', nullable: true },
          height: { type: 'integer', nullable: true },
          folderId: { type: 'string', format: 'uuid', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ apiKey: [] }],
  paths: {
    '/posts': {
      get: {
        summary: 'List posts',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['original', 'reshare'] } },
          { name: 'platform', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
        ],
        responses: {
          '200': {
            description: 'List of posts',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/PostRow' } },
                    meta: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create a draft post',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/PostCreate' } },
          },
        },
        responses: {
          '200': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object', properties: { id: { type: 'string' } } } } } } } },
        },
      },
    },
    '/posts/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: { summary: 'Get a post with versions, targets, and activity', responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
      patch: {
        summary: 'Update status / scheduled time / labels',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PostPatch' } } } },
        responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } },
      },
      delete: { summary: 'Delete a post', responses: { '200': { description: 'OK' } } },
    },
    '/campaigns': {
      get: {
        summary: 'List campaigns',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/campaigns/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: { summary: 'Get a campaign with steps', responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
      delete: { summary: 'Delete a campaign', responses: { '200': { description: 'OK' } } },
    },
    '/accounts': {
      get: { summary: 'List connected social accounts', responses: { '200': { description: 'OK' } } },
    },
    '/analytics': {
      get: {
        summary: 'Analytics summary, follower series, and per-platform rollup',
        parameters: [
          { name: 'range', in: 'query', schema: { type: 'string', enum: ['7d', '30d', '90d', 'custom'] } },
          { name: 'fromIso', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'toIso', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/media': {
      get: {
        summary: 'List media assets',
        parameters: [
          { name: 'folderId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'filter', in: 'query', schema: { type: 'string', enum: ['all', 'image', 'video', 'gif'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['date_desc', 'date_asc', 'name', 'size'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'offset', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Asset' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Upload a media asset',
        parameters: [{ name: 'folderId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string', format: 'binary' } },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Asset' } },
            },
          },
        },
      },
    },
    '/media/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      delete: { summary: 'Delete a media asset', responses: { '200': { description: 'OK' } } },
    },
  },
} as const

export const Route = createFileRoute('/api/v1/openapi/json')({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(spec), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }),
    },
  },
})
