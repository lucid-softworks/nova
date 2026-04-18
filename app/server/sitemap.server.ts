import { asc } from 'drizzle-orm'
import { db, schema } from './db'

/**
 * Build a sitemap.xml listing canonical URLs for search engines.
 * Static surface (homepage) + every public bio page.
 */
export async function buildSitemapXml(): Promise<string> {
  const base = (process.env.APP_URL ?? 'https://skeduleit.org').replace(/\/+$/, '')

  const bios = await db
    .select({ handle: schema.bioPages.handle, createdAt: schema.bioPages.createdAt })
    .from(schema.bioPages)
    .orderBy(asc(schema.bioPages.createdAt))

  const today = new Date().toISOString().slice(0, 10)
  const urls: { loc: string; lastmod: string; changefreq?: string; priority?: string }[] = [
    { loc: `${base}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' },
  ]
  for (const b of bios) {
    urls.push({
      loc: `${base}/bio/${encodeURIComponent(b.handle)}`,
      lastmod: b.createdAt.toISOString().slice(0, 10),
      changefreq: 'daily',
      priority: '0.8',
    })
  }

  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

  const body = urls
    .map((u) => {
      const lines = [`    <loc>${esc(u.loc)}</loc>`, `    <lastmod>${u.lastmod}</lastmod>`]
      if (u.changefreq) lines.push(`    <changefreq>${u.changefreq}</changefreq>`)
      if (u.priority) lines.push(`    <priority>${u.priority}</priority>`)
      return `  <url>\n${lines.join('\n')}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`
}
