/**
 * Minimal RSS 2.0 / Atom parser. Regex-based so we don't pull in a full
 * XML library; good enough for the well-formed feeds produced by common
 * platforms (WordPress, Ghost, Substack, Medium).
 */

export type FeedItem = {
  guid: string
  link: string | null
  title: string
  description: string
  publishedAt: Date | null
}

export type ParsedFeed = {
  title: string | null
  items: FeedItem[]
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

function textOfTag(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block)
  if (!m) return null
  return decode(m[1]!)
}

function attrOfTag(block: string, tag: string, attr: string): string | null {
  const m = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`, 'i').exec(block)
  return m ? decode(m[1]!) : null
}

function parseDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function parseFeed(xml: string): ParsedFeed {
  const isAtom = /<feed\b[^>]*xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/i.test(xml)
  const channelBlock = isAtom
    ? xml
    : (/<channel[\s\S]*?<\/channel>/i.exec(xml)?.[0] ?? xml)
  const title = textOfTag(channelBlock, 'title')

  const itemRegex = isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi
  const items: FeedItem[] = []
  for (const m of channelBlock.matchAll(itemRegex)) {
    const block = m[0]
    const rawTitle = textOfTag(block, 'title') ?? ''
    const description =
      textOfTag(block, 'content:encoded') ??
      textOfTag(block, 'content') ??
      textOfTag(block, 'description') ??
      textOfTag(block, 'summary') ??
      ''
    const link = isAtom
      ? attrOfTag(block, 'link', 'href')
      : textOfTag(block, 'link')
    const guid =
      textOfTag(block, 'guid') ??
      textOfTag(block, 'id') ??
      link ??
      rawTitle
    const pub = parseDate(
      textOfTag(block, 'pubDate') ??
        textOfTag(block, 'published') ??
        textOfTag(block, 'updated'),
    )
    if (!guid) continue
    items.push({
      guid,
      link,
      title: stripTags(rawTitle).trim(),
      description: stripTags(description).trim(),
      publishedAt: pub,
    })
  }

  return { title: title ? stripTags(title).trim() : null, items }
}

export function applyTemplate(
  template: string,
  item: { title: string; link: string | null; description: string },
): string {
  return template
    .replaceAll('{{title}}', item.title)
    .replaceAll('{{link}}', item.link ?? '')
    .replaceAll('{{description}}', item.description)
}
