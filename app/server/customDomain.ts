import dns from 'node:dns'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { requireWorkspaceDetail } from './session.server'
import type { WorkspaceRole } from './types'

function isAdmin(role: WorkspaceRole): boolean {
  return role === 'admin'
}

// ---------- setCustomDomain --------------------------------------------------

const setDomainInput = z.object({
  workspaceSlug: z.string().min(1),
  domain: z.string().min(1).max(253),
})

export const setCustomDomain = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => setDomainInput.parse(d))
  .handler(async ({ data }) => {
    const r = await requireWorkspaceDetail(data.workspaceSlug)
    if (!r.ok) throw new Error(r.reason)
    if (!isAdmin(r.detail.role)) throw new Error('Admins only')

    const domain = data.domain.trim().toLowerCase()

    await db
      .update(schema.workspaces)
      .set({ customDomain: domain, domainVerified: false })
      .where(eq(schema.workspaces.id, r.detail.workspaceId))

    return { ok: true, domain }
  })

// ---------- verifyCustomDomain -----------------------------------------------

const verifyInput = z.object({ workspaceSlug: z.string().min(1) })

export const verifyCustomDomain = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => verifyInput.parse(d))
  .handler(async ({ data }) => {
    const r = await requireWorkspaceDetail(data.workspaceSlug)
    if (!r.ok) throw new Error(r.reason)
    if (!isAdmin(r.detail.role)) throw new Error('Admins only')

    const ws = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, r.detail.workspaceId),
    })
    if (!ws?.customDomain) throw new Error('No custom domain set')

    const expected = `_nova-verify=${r.detail.workspaceId}`
    let verified = false
    try {
      const records = await dns.promises.resolveTxt(`_nova-verify.${ws.customDomain}`)
      verified = records.some((entry) => entry.join('') === expected)
    } catch {
      // DNS lookup failed — not verified
    }

    if (verified) {
      await db
        .update(schema.workspaces)
        .set({ domainVerified: true })
        .where(eq(schema.workspaces.id, r.detail.workspaceId))
    }

    return { verified }
  })

// ---------- getCustomDomain --------------------------------------------------

const getInput = z.object({ workspaceSlug: z.string().min(1) })

export const getCustomDomain = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => getInput.parse(d))
  .handler(async ({ data }) => {
    const r = await requireWorkspaceDetail(data.workspaceSlug)
    if (!r.ok) throw new Error(r.reason)

    const ws = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, r.detail.workspaceId),
    })

    return {
      domain: ws?.customDomain ?? null,
      verified: ws?.domainVerified ?? false,
    }
  })

// ---------- resolveWorkspaceByDomain -----------------------------------------

export const resolveWorkspaceByDomain = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ hostname: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const ws = await db.query.workspaces.findFirst({
      where: and(
        eq(schema.workspaces.customDomain, data.hostname.toLowerCase()),
        eq(schema.workspaces.domainVerified, true),
      ),
    })
    if (!ws) return { slug: null }

    const org = await db.query.organization.findFirst({
      where: eq(schema.organization.id, ws.organizationId),
    })
    return { slug: org?.slug ?? null }
  })
