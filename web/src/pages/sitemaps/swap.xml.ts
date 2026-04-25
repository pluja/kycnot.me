import he from 'he'

import { POPULAR_SWAP_PAIRS } from '../../lib/exchange/swapPageInfo'
import { buildSwapUrl } from '../../lib/exchange/swapUrls'

import type { APIRoute } from 'astro'

// Static sitemap. No aggregator call, so the URL set is stable under
// backend outages and mirrors what the page canonicalises to.
export const GET: APIRoute = ({ site }) => {
  if (!site) return new Response('Site URL not configured', { status: 500 })

  const origin = site.origin
  const today = new Date().toISOString().slice(0, 10)
  const entries: string[] = []

  entries.push(
    `<url><loc>${he.encode(`${origin}/swap`)}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`
  )

  for (const { from, to } of POPULAR_SWAP_PAIRS) {
    const loc = he.encode(`${origin}${buildSwapUrl(from, to)}`)
    entries.push(
      `<url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`
    )
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${entries.join('\n  ')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
