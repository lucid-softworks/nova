import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { importPostsFromCsvImpl, type ImportReport } from './csv.server'

export type { ImportReport }

const importInput = z.object({
  workspaceSlug: z.string().min(1),
  csvText: z.string().min(1),
})

export const importPostsFromCsv = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => importInput.parse(d))
  .handler(async ({ data }) => importPostsFromCsvImpl(data.workspaceSlug, data.csvText))
