import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { saveCampaignImpl } from './campaigns.server'

const stepSchema = z.object({
  clientId: z.string(),
  selectedAccountIds: z.array(z.string().uuid()),
  content: z.string().max(100_000),
  mediaIds: z.array(z.string().uuid()),
  dependsOnClientStepId: z.string().nullable(),
  triggerType: z.enum(['immediate', 'delay', 'scheduled']).nullable(),
  triggerDelayMinutes: z.number().int().min(1).max(60 * 24 * 30).nullable(),
  triggerScheduledAt: z.string().datetime().nullable(),
})

const saveSchema = z.object({
  workspaceSlug: z.string().min(1),
  name: z.string().min(1).max(200),
  asDraft: z.boolean(),
  steps: z.array(stepSchema).min(1),
})

export const saveCampaign = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data }) => saveCampaignImpl(data))
