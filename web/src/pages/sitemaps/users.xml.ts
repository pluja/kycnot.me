import he from 'he'

import { prisma } from '../../lib/prisma'
import { indexableUserProfileWhere } from '../../lib/userProfileSeo'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ site }) => {
  if (!site) return new Response('Site URL not configured', { status: 500 })

  try {
    const users = await prisma.user.findMany({
      where: indexableUserProfileWhere,
      select: { name: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    })

    const origin = site.origin
    const urls = users
      .map((user) => {
        const loc = he.encode(`${origin}/u/${user.name}`)
        const lastmod = user.updatedAt.toISOString().slice(0, 10)
        return `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`
      })
      .join('\n  ')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
</urlset>`

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    console.error('Failed to generate users sitemap:', error)
    return new Response('Failed to generate users sitemap', { status: 500 })
  }
}
