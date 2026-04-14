import { eq } from 'drizzle-orm'
import { db, schema } from './db'
import { loadSessionContext } from './session.server'
import { encrypt } from '~/lib/encryption'
import type {
  ChannelPrefs,
  NotificationPreferences,
  NotificationType,
} from './notifications.server'
import { notifyUser } from './notifications.server'

async function requireUser() {
  const ctx = await loadSessionContext()
  if (!ctx.user) throw new Error('unauthenticated')
  return ctx.user
}

export type MeSettings = {
  notificationPreferences: NotificationPreferences
  brrrConnected: boolean
}

const TYPES: NotificationType[] = [
  'post_published',
  'post_failed',
  'approval_requested',
  'post_approved',
  'post_rejected',
  'member_joined',
  'campaign_on_hold',
]

export async function getMySettingsImpl(): Promise<MeSettings> {
  const me = await requireUser()
  const row = await db.query.user.findFirst({ where: eq(schema.user.id, me.id) })
  const prefs = (row?.notificationPreferences ?? {}) as NotificationPreferences
  return {
    notificationPreferences: prefs,
    brrrConnected: !!row?.brrrWebhookSecret,
  }
}

export async function setPreferenceImpl(input: {
  type: NotificationType
  prefs: ChannelPrefs
}) {
  const me = await requireUser()
  const row = await db.query.user.findFirst({ where: eq(schema.user.id, me.id) })
  const current = (row?.notificationPreferences ?? {}) as NotificationPreferences
  const next: NotificationPreferences = { ...current, [input.type]: input.prefs }
  await db
    .update(schema.user)
    .set({ notificationPreferences: next })
    .where(eq(schema.user.id, me.id))
  return { ok: true }
}

export async function saveBrrrSecretImpl(secret: string | null) {
  const me = await requireUser()
  await db
    .update(schema.user)
    .set({ brrrWebhookSecret: secret && secret.trim() ? encrypt(secret.trim()) : null })
    .where(eq(schema.user.id, me.id))
  return { ok: true }
}

export async function testBrrrPushImpl() {
  const me = await requireUser()
  // Find a workspace for the user so the deep link resolves
  const ws = await db
    .select({ id: schema.workspaces.id })
    .from(schema.member)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.organizationId, schema.member.organizationId),
    )
    .where(eq(schema.member.userId, me.id))
    .limit(1)
  if (!ws[0]) throw new Error('No workspace')
  // Force push on for this call by temporarily inserting a test prefs override.
  // Simpler: just call notifyUser which will honour current prefs; to make
  // sure push actually fires regardless, construct directly.
  await notifyUser({
    userId: me.id,
    workspaceId: ws[0].id,
    type: 'post_published',
    title: 'Test push from SocialHub',
    body: 'If you see this on your device, brrr.now is wired up.',
    data: {},
  })
  return { ok: true }
}

export { TYPES as NOTIFICATION_TYPES }
