export type UtmParams = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

export function appendUtmParams(content: string, params: UtmParams): string {
  const active = Object.entries(params).filter(
    ([, v]) => typeof v === 'string' && v.length > 0,
  )
  if (active.length === 0) return content

  return content.replace(URL_RE, (raw) => {
    try {
      const url = new URL(raw)
      for (const [key, value] of active) {
        if (!url.searchParams.has(key)) url.searchParams.set(key, value as string)
      }
      return url.toString()
    } catch {
      return raw
    }
  })
}

export function mergeUtmParams(
  workspaceDefaults: UtmParams | undefined,
  perPost: Record<string, string>,
): UtmParams {
  const base: UtmParams = { ...workspaceDefaults }
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
    if (perPost[key]) base[key] = perPost[key]
  }
  return base
}
