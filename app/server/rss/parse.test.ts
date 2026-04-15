import { describe, expect, it } from 'vitest'
import { applyTemplate, parseFeed } from './parse'

describe('parseFeed — RSS 2.0', () => {
  const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>My Blog</title>
  <item>
    <title>First Post</title>
    <link>https://example.com/1</link>
    <guid>post-1</guid>
    <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    <description>hello world</description>
  </item>
  <item>
    <title>Second Post</title>
    <link>https://example.com/2</link>
    <guid>post-2</guid>
    <pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate>
    <description>goodbye</description>
  </item>
</channel></rss>`

  it('extracts title, link, guid, pubDate for each item', () => {
    const feed = parseFeed(rss)
    expect(feed.title).toBe('My Blog')
    expect(feed.items).toHaveLength(2)
    expect(feed.items[0]).toMatchObject({
      title: 'First Post',
      link: 'https://example.com/1',
      guid: 'post-1',
    })
    expect(feed.items[0]!.publishedAt?.toISOString()).toBe('2024-01-01T12:00:00.000Z')
    expect(feed.items[1]!.guid).toBe('post-2')
  })

  it('decodes CDATA-wrapped titles', () => {
    const xml = `<rss><channel><title>x</title>
<item><title><![CDATA[Hello & <b>World</b>]]></title><link>u</link><guid>g</guid></item>
</channel></rss>`
    const feed = parseFeed(xml)
    expect(feed.items[0]!.title).toBe('Hello & World')
  })
})

describe('parseFeed — Atom 1.0', () => {
  const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atomic</title>
  <entry>
    <id>urn:uuid:abc</id>
    <title>Entry One</title>
    <link href="https://example.com/a" />
    <updated>2024-03-04T05:06:07Z</updated>
    <summary>sum</summary>
  </entry>
</feed>`

  it('uses <id> as guid, link href attribute, and <updated> as date', () => {
    const feed = parseFeed(atom)
    expect(feed.title).toBe('Atomic')
    expect(feed.items).toHaveLength(1)
    const item = feed.items[0]!
    expect(item.guid).toBe('urn:uuid:abc')
    expect(item.link).toBe('https://example.com/a')
    expect(item.title).toBe('Entry One')
    expect(item.publishedAt?.toISOString()).toBe('2024-03-04T05:06:07.000Z')
  })
})

describe('applyTemplate', () => {
  it('substitutes {{title}}, {{link}}, {{description}}', () => {
    const out = applyTemplate('{{title}} — {{link}} :: {{description}}', {
      title: 'Hi',
      link: 'https://x',
      description: 'desc',
    })
    expect(out).toBe('Hi — https://x :: desc')
  })

  it('replaces all occurrences of each placeholder', () => {
    const out = applyTemplate('{{title}} {{title}}', {
      title: 'A',
      link: null,
      description: '',
    })
    expect(out).toBe('A A')
  })

  it('renders empty string for null link', () => {
    const out = applyTemplate('[{{link}}]', { title: '', link: null, description: '' })
    expect(out).toBe('[]')
  })
})
