import { local } from './providers/local'
import { dubProvider } from './providers/dub'
import type { ShortenerName, ShortenerProvider } from './types'

const registry: Record<ShortenerName, ShortenerProvider> = {
  local,
  dub: dubProvider,
}

function selected(): ShortenerName {
  const raw = (process.env.SHORTENER_PROVIDER ?? 'local').toLowerCase() as ShortenerName
  return raw in registry ? raw : 'local'
}

export function getShortener(): ShortenerProvider {
  return registry[selected()]
}

export function getShortenerByName(name: string): ShortenerProvider | null {
  return (registry as Record<string, ShortenerProvider | undefined>)[name] ?? null
}

export function currentShortenerName(): ShortenerName {
  return selected()
}

export type { ShortenerName, ShortenerProvider, ShortenCtx, ShortenResult } from './types'
