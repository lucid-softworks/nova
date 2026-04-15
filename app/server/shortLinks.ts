import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { shortenUrlImpl } from './shortLinks.server'

const input = z.object({
  workspaceSlug: z.string().min(1),
  targetUrl: z.string().url(),
})

export const shortenUrl = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => shortenUrlImpl(data.workspaceSlug, data.targetUrl))
