import { safeFetch } from '~/lib/safe-fetch'

export type ExternalPreview = {
  uri: string
  title: string
  description: string
  imageBytes: Uint8Array | null
  imageMime: string | null
}

/**
 * Minimal Open Graph metadata scraper. Returns null when the page
 * can't be fetched or doesn't advertise a title — the caller should
 * then skip the link card rather than emit a half-empty preview.
 */
export async function fetchLinkPreview(uri: string): Promise<ExternalPreview | null> {
  let res: Response
  try {
    res = await safeFetch(uri, {
      headers: {
        'User-Agent': 'nova-linkcard/1.0 (+https://skeduleit.org)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) return null
  // Read up to 256KB — enough for the <head>, not enough to OOM on a
  // malicious server that streams gigabytes.
  const rawBuf = await res.arrayBuffer()
  const html = new TextDecoder('utf-8').decode(rawBuf.slice(0, 256 * 1024))

  const meta = (property: string): string | null => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`,
      'i',
    )
    const tag = re.exec(html)?.[0]
    if (!tag) return null
    const content = /content=["']([^"']+)["']/i.exec(tag)?.[1]
    return content ? decodeHtmlEntities(content.trim()) : null
  }

  const title =
    meta('og:title') ||
    meta('twitter:title') ||
    (/<title>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? null)
  if (!title) return null
  const description = meta('og:description') || meta('twitter:description') || meta('description') || ''
  const imageUrl = meta('og:image') || meta('twitter:image')

  let imageBytes: Uint8Array | null = null
  let imageMime: string | null = null
  if (imageUrl) {
    try {
      const absolute = new URL(imageUrl, uri).toString()
      const imgRes = await safeFetch(absolute, {
        headers: { 'User-Agent': 'nova-linkcard/1.0' },
        signal: AbortSignal.timeout(10_000),
      })
      if (imgRes.ok) {
        const contentLength = Number(imgRes.headers.get('content-length') ?? 0)
        // Bluesky's blob size limit for images is 1MB.
        if (!contentLength || contentLength <= 1_000_000) {
          const buf = await imgRes.arrayBuffer()
          if (buf.byteLength <= 1_000_000) {
            imageBytes = new Uint8Array(buf)
            imageMime = imgRes.headers.get('content-type') ?? 'image/jpeg'
          }
        }
      }
    } catch {
      // Non-fatal — embed without thumbnail.
    }
  }

  return {
    uri,
    title: clip(title, 300),
    description: clip(description, 1000),
    imageBytes,
    imageMime,
  }
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
}

function decodeHtmlEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m)
}
