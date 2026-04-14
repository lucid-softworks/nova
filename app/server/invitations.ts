import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { loadInvitationImpl, acceptInvitationImpl } from './invitations.server'

const idOnly = z.object({ invitationId: z.string().min(1) })

export const loadInvitation = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => idOnly.parse(d))
  .handler(async ({ data }) => loadInvitationImpl(data.invitationId))

const acceptSchema = z.object({
  invitationId: z.string().min(1),
  reject: z.boolean().optional(),
})

export const acceptInvitation = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => acceptSchema.parse(d))
  .handler(async ({ data }) =>
    acceptInvitationImpl(data.invitationId, data.reject ?? false),
  )
