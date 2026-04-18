import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  getWorkspaceSettingsImpl,
  updateWorkspaceGeneralImpl,
  deleteWorkspaceImpl,
  getPostingScheduleImpl,
  setPostingScheduleImpl,
  listApiKeysImpl,
  createApiKeyImpl,
  deleteApiKeyImpl,
  listWebhooksImpl,
  createWebhookImpl,
  updateWebhookImpl,
  deleteWebhookImpl,
  getWorkspaceAiKeysImpl,
  setWorkspaceAnthropicKeyImpl,
  type ApiKeyRow,
  type PostingSchedule,
  type WebhookRow,
  type WorkspaceAiKeys,
  type WorkspaceSettings,
} from './settings.server'

export type { ApiKeyRow, PostingSchedule, WebhookRow, WorkspaceAiKeys, WorkspaceSettings }

const wsOnly = z.object({ workspaceSlug: z.string().min(1) })

export const getWorkspaceSettings = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => getWorkspaceSettingsImpl(data.workspaceSlug))

const generalSchema = z.object({
  workspaceSlug: z.string().min(1),
  name: z.string().max(200).optional(),
  slug: z.string().max(80).optional(),
  timezone: z.string().max(64).optional(),
  defaultLanguage: z.string().max(10).optional(),
  logoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  appName: z.string().max(120).or(z.literal('')).nullable().optional(),
})

export const updateWorkspaceGeneral = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => generalSchema.parse(d))
  .handler(async ({ data }) => {
    const { workspaceSlug, ...patch } = data
    const normalized = {
      ...patch,
      logoUrl: patch.logoUrl === '' ? null : (patch.logoUrl ?? undefined),
      appName: patch.appName === '' ? null : (patch.appName ?? undefined),
    }
    return updateWorkspaceGeneralImpl(workspaceSlug, normalized)
  })

const deleteSchema = z.object({
  workspaceSlug: z.string().min(1),
  confirmName: z.string(),
})

export const deleteWorkspace = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data }) => deleteWorkspaceImpl(data.workspaceSlug, data.confirmName))

export const getPostingSchedule = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => getPostingScheduleImpl(data.workspaceSlug))

const scheduleSchema = z.object({
  workspaceSlug: z.string().min(1),
  schedule: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
    }),
  ),
})

export const setPostingSchedule = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => scheduleSchema.parse(d))
  .handler(async ({ data }) => setPostingScheduleImpl(data.workspaceSlug, data.schedule))

export const listApiKeys = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => listApiKeysImpl(data.workspaceSlug))

const createKeySchema = z.object({
  workspaceSlug: z.string().min(1),
  name: z.string().min(1).max(120),
})

export const createApiKey = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createKeySchema.parse(d))
  .handler(async ({ data }) => createApiKeyImpl(data.workspaceSlug, data.name))

const deleteKeySchema = z.object({
  workspaceSlug: z.string().min(1),
  keyId: z.string().uuid(),
})

export const deleteApiKey = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteKeySchema.parse(d))
  .handler(async ({ data }) => deleteApiKeyImpl(data.workspaceSlug, data.keyId))

export const listWebhooks = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => listWebhooksImpl(data.workspaceSlug))

const createWebhookSchema = z.object({
  workspaceSlug: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()),
})

export const createWebhook = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createWebhookSchema.parse(d))
  .handler(async ({ data }) => createWebhookImpl(data.workspaceSlug, data.url, data.events))

const updateWebhookSchema = z.object({
  workspaceSlug: z.string().min(1),
  webhookId: z.string().uuid(),
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

export const updateWebhook = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => updateWebhookSchema.parse(d))
  .handler(async ({ data }) =>
    updateWebhookImpl(data.workspaceSlug, data.webhookId, {
      url: data.url,
      events: data.events,
      isActive: data.isActive,
    }),
  )

const deleteWebhookSchema = z.object({
  workspaceSlug: z.string().min(1),
  webhookId: z.string().uuid(),
})

export const deleteWebhook = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteWebhookSchema.parse(d))
  .handler(async ({ data }) => deleteWebhookImpl(data.workspaceSlug, data.webhookId))

export const getWorkspaceAiKeys = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => getWorkspaceAiKeysImpl(data.workspaceSlug))

const setAnthropicSchema = z.object({
  workspaceSlug: z.string().min(1),
  key: z.string().nullable(),
})

export const setWorkspaceAnthropicKey = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => setAnthropicSchema.parse(d))
  .handler(async ({ data }) => setWorkspaceAnthropicKeyImpl(data.workspaceSlug, data.key))
