import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { PLATFORM_KEYS } from '~/lib/platforms'
import {
  listTemplatesImpl,
  createTemplateImpl,
  updateTemplateImpl,
  deleteTemplateImpl,
  listHashtagGroupsImpl,
  createHashtagGroupImpl,
  updateHashtagGroupImpl,
  deleteHashtagGroupImpl,
  normalizeHashtags,
  type TemplateRow,
  type HashtagGroupRow,
} from './templates.server'

export type { TemplateRow, HashtagGroupRow }
export { normalizeHashtags }

const wsOnly = z.object({ workspaceSlug: z.string().min(1) })

export const listTemplates = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => listTemplatesImpl(data.workspaceSlug))

export const listHashtagGroups = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsOnly.parse(d))
  .handler(async ({ data }) => listHashtagGroupsImpl(data.workspaceSlug))

const templateInput = z.object({
  name: z.string().min(1).max(120),
  content: z.string().max(100_000),
  platforms: z.array(z.enum(PLATFORM_KEYS)),
})

const createTemplateSchema = z.object({ workspaceSlug: z.string().min(1) }).merge(templateInput)

export const createTemplate = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createTemplateSchema.parse(d))
  .handler(async ({ data }) =>
    createTemplateImpl(data.workspaceSlug, {
      name: data.name,
      content: data.content,
      platforms: data.platforms,
    }),
  )

const updateTemplateSchema = createTemplateSchema.extend({ templateId: z.string().uuid() })

export const updateTemplate = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => updateTemplateSchema.parse(d))
  .handler(async ({ data }) =>
    updateTemplateImpl(data.workspaceSlug, data.templateId, {
      name: data.name,
      content: data.content,
      platforms: data.platforms,
    }),
  )

const deleteTemplateSchema = z.object({
  workspaceSlug: z.string().min(1),
  templateId: z.string().uuid(),
})

export const deleteTemplate = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteTemplateSchema.parse(d))
  .handler(async ({ data }) => deleteTemplateImpl(data.workspaceSlug, data.templateId))

const hashtagInput = z.object({
  name: z.string().min(1).max(120),
  hashtags: z.array(z.string()).max(200),
})
const createGroupSchema = z.object({ workspaceSlug: z.string().min(1) }).merge(hashtagInput)

export const createHashtagGroup = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createGroupSchema.parse(d))
  .handler(async ({ data }) =>
    createHashtagGroupImpl(data.workspaceSlug, { name: data.name, hashtags: data.hashtags }),
  )

const updateGroupSchema = createGroupSchema.extend({ groupId: z.string().uuid() })

export const updateHashtagGroup = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => updateGroupSchema.parse(d))
  .handler(async ({ data }) =>
    updateHashtagGroupImpl(data.workspaceSlug, data.groupId, {
      name: data.name,
      hashtags: data.hashtags,
    }),
  )

const deleteGroupSchema = z.object({
  workspaceSlug: z.string().min(1),
  groupId: z.string().uuid(),
})

export const deleteHashtagGroup = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteGroupSchema.parse(d))
  .handler(async ({ data }) => deleteHashtagGroupImpl(data.workspaceSlug, data.groupId))
