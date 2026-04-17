/**
 * AT Protocol facets require UTF-8 byte offsets, not JS string indices,
 * so every detected span has to be converted before emitting.
 *
 * The grammar below mirrors the canonical implementation in the atproto
 * repo (see packages/api/src/rich-text/detection.ts). We intentionally
 * keep regex sources loose-but-safe and validate afterwards.
 */

export type FacetFeature =
  | { $type: 'app.bsky.richtext.facet#mention'; did: string }
  | { $type: 'app.bsky.richtext.facet#tag'; tag: string }
  | { $type: 'app.bsky.richtext.facet#link'; uri: string }

export type Facet = {
  index: { byteStart: number; byteEnd: number }
  features: FacetFeature[]
}

export type RawFacet = {
  index: { byteStart: number; byteEnd: number }
  kind: 'mention' | 'tag' | 'link'
  value: string
}

// Pre-compute UTF-8 byte offsets so we can translate JS string indices
// into the encoding the AT protocol wants without re-encoding the whole
// string per facet.
function buildByteIndex(text: string): number[] {
  const enc = new TextEncoder()
  const offsets: number[] = new Array(text.length + 1)
  let byte = 0
  offsets[0] = 0
  for (let i = 0; i < text.length; i++) {
    byte += enc.encode(text[i]).length
    offsets[i + 1] = byte
  }
  return offsets
}

const MENTION_RE = /(^|[\s(])(@[a-zA-Z0-9.-]+)(?=\s|$|[.,!?;:)])/g
const TAG_RE = /(^|[\s(])(#[^\s#.,!?;:)]+)/g
const URL_RE =
  /(^|[\s(])(https?:\/\/[^\s)]+?)(?=[\s)]|[.,!?;:)]?($|\s))/g

export function detectRawFacets(text: string): RawFacet[] {
  const offsets = buildByteIndex(text)
  const out: RawFacet[] = []

  const push = (start: number, end: number, kind: RawFacet['kind'], value: string) => {
    out.push({ index: { byteStart: offsets[start]!, byteEnd: offsets[end]! }, kind, value })
  }

  let m: RegExpExecArray | null
  MENTION_RE.lastIndex = 0
  while ((m = MENTION_RE.exec(text))) {
    const leading = m[1] ?? ''
    const token = m[2] ?? ''
    if (!token) continue
    const start = m.index + leading.length
    const end = start + token.length
    // Validate handle-ish: must contain a dot (e.g. user.bsky.social) to
    // avoid matching mid-word @ symbols.
    const handle = token.slice(1)
    if (!handle.includes('.')) continue
    push(start, end, 'mention', handle)
  }

  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(text))) {
    const leading = m[1] ?? ''
    const token = m[2] ?? ''
    if (!token) continue
    const tag = token.slice(1)
    // Skip pure-numeric (e.g. #1) and empty.
    if (!tag || /^\d+$/.test(tag)) continue
    if (tag.length > 64) continue
    const start = m.index + leading.length
    const end = start + token.length
    push(start, end, 'tag', tag)
  }

  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(text))) {
    const leading = m[1] ?? ''
    const url = m[2] ?? ''
    if (!url) continue
    const start = m.index + leading.length
    const end = start + url.length
    push(start, end, 'link', url)
  }

  // Sort by start so overlapping tokens (unlikely but possible) are handled
  // in document order.
  out.sort((a, b) => a.index.byteStart - b.index.byteStart)
  return out
}

/**
 * Given raw spans, resolve mention handles into DIDs and construct the
 * final facets array ready to attach to an AT protocol post record.
 * Unresolvable mentions are dropped (they'll render as plain text).
 */
export async function buildFacets(
  raw: RawFacet[],
  resolveHandle: (handle: string) => Promise<string | null>,
): Promise<Facet[]> {
  const facets: Facet[] = []
  // Cache mention lookups per unique handle.
  const resolved = new Map<string, string | null>()
  for (const r of raw) {
    if (r.kind === 'mention') {
      if (!resolved.has(r.value)) {
        resolved.set(r.value, await resolveHandle(r.value).catch(() => null))
      }
      const did = resolved.get(r.value)
      if (!did) continue
      facets.push({
        index: r.index,
        features: [{ $type: 'app.bsky.richtext.facet#mention', did }],
      })
    } else if (r.kind === 'tag') {
      facets.push({
        index: r.index,
        features: [{ $type: 'app.bsky.richtext.facet#tag', tag: r.value }],
      })
    } else {
      facets.push({
        index: r.index,
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: r.value }],
      })
    }
  }
  return facets
}
