import type { APIRoute } from 'astro'

const getRobotsTxt = (sitemaps: `/${string}`[], siteUrl: URL) => `
User-agent: *
Allow: /
Disallow: /admin/

${sitemaps.map((sitemap) => `Sitemap: ${new URL(sitemap, siteUrl).href}`).join('\n')}
`

export const GET: APIRoute = ({ site }) => {
  if (!site) return new Response('Site URL not configured', { status: 500 })

  return new Response(getRobotsTxt(['/sitemap-index.xml', '/sitemaps/search.xml'], site))
}
