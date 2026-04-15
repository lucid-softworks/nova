export type ShortenerName = 'local' | 'dub'

export type ShortenCtx = {
  workspaceId: string
  userId: string
  targetUrl: string
}

export type ShortenResult = {
  /** Public short URL the user will share. */
  url: string
  /** Slug / key the provider uses for lookups — may be our internal
   * 6-char slug or the provider's. */
  slug: string
  /** Optional provider-side id (Dub link id) for later analytics. */
  externalId: string | null
}

export interface ShortenerProvider {
  readonly name: ShortenerName
  shorten(ctx: ShortenCtx): Promise<ShortenResult>
  /** Resolve a slug to its target URL. Only meaningful for drivers
   * that own the redirect (local). Dub handles redirects itself. */
  resolve?(slug: string): Promise<string | null>
  /** Optional Better Auth plugin factory. */
  betterAuthPlugin?(): unknown | null
}
