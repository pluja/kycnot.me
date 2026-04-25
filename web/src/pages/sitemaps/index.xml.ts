import he from 'he'

import type { APIRoute } from 'astro'

const SITEMAPS = [
  '/sitemap-0.xml',
  '/sitemaps/search.xml',
  '/sitemaps/services.xml',
  '/sitemaps/users.xml',
  '/sitemaps/blog.xml',
  '/sitemaps/swap.xml',
]

export const GET: APIRoute = ({ site }) => {
  if (!site) return new Response('Site URL not configured', { status: 500 })

  const origin = site.origin
  const entries = SITEMAPS.map(
    (path) => `<sitemap><loc>${he.encode(`${origin}${path}`)}</loc></sitemap>`
  ).join('\n  ')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${entries}
</sitemapindex>`

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
