import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  getMySettingsImpl,
  setPreferenceImpl,
  saveBrrrSecretImpl,
  testBrrrPushImpl,
} from './me.server'

export type { MeSettings } from './me.server'

export const getMySettings = createServerFn({ method: 'GET' }).handler(async () =>
  getMySettingsImpl(),
)

const typeEnum = z.enum([
  'post_published',
  'post_failed',
  'approval_requested',
  'post_approved',
  'post_rejected',
  'member_joined',
  'campaign_on_hold',
])

const setPrefSchema = z.object({
  type: typeEnum,
  prefs: z.object({
    inApp: z.boolean(),
    email: z.boolean(),
    push: z.boolean(),
  }),
})

export const setPreference = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => setPrefSchema.parse(d))
  .handler(async ({ data }) => setPreferenceImpl(data))

const brrrSchema = z.object({ secret: z.string().nullable() })

export const saveBrrrSecret = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => brrrSchema.parse(d))
  .handler(async ({ data }) => saveBrrrSecretImpl(data.secret))

export const testBrrrPush = createServerFn({ method: 'POST' }).handler(async () =>
  testBrrrPushImpl(),
)
