import { getShortener } from '~/lib/shortener'
import { requireWorkspaceAccess } from './session.server'

export async function shortenUrlImpl(
  slug: string,
  targetUrl: string,
): Promise<{ slug: string; url: string; externalId: string | null }> {
  const r = await requireWorkspaceAccess(slug)
  if (!r.ok) throw new Error(r.reason)
  try {
    new URL(targetUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  const provider = getShortener()
  return provider.shorten({ workspaceId: r.workspace.id, userId: r.user.id, targetUrl })
}

export async function resolveShortLinkImpl(slug: string): Promise<string | null> {
  const provider = getShortener()
  // Dub owns its own redirect — local is the only provider that needs
  // us to resolve here.
  if (!provider.resolve) return null
  return provider.resolve(slug)
}
