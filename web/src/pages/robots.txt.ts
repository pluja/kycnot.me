import { buildRobotsTxt } from '../lib/robotsTxt'

import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
  if (!site) return new Response('Site URL not configured', { status: 500 })

  return new Response(buildRobotsTxt(`${site.origin}/sitemaps/index.xml`), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
