import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
  if (!site) return new Response('Site URL not configured', { status: 500 })

  const sitemapUrl = `${site.origin}/sitemaps/index.xml`

  const body = `# AI search bots (allowed for visibility)
User-agent: ChatGPT-User
User-agent: OAI-SearchBot
User-agent: PerplexityBot
User-agent: Claude-SearchBot
Allow: /
Disallow: /admin/
Disallow: /internal-api/
Disallow: /api/
Disallow: /feeds/user/

# AI training/scraping bots (blocked per license)
User-agent: GPTBot
User-agent: Google-Extended
User-agent: anthropic-ai
User-agent: CCBot
User-agent: Applebot-Extended
User-agent: Bytespider
User-agent: Diffbot
Disallow: /

# All other crawlers
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /internal-api/
Disallow: /api/
Disallow: /feeds/user/
Disallow: /swap?*sendAmount=
Disallow: /swap?*receiveAmount=
Disallow: /swap?*sortBy=
Disallow: /swap?*approvedOnly=

Sitemap: ${sitemapUrl}
`

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
