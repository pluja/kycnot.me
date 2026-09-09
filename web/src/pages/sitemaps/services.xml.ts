import he from 'he'

import { prisma } from '../../lib/prisma'

import type { APIRoute } from 'astro'

type SitemapRow = { slug: string; reviewedAt: Date | null; listedAt: Date | null; createdAt: Date }

export const GET: APIRoute = async ({ site }) => {
  if (!site) return new Response('Site URL not configured', { status: 500 })

  try {
    // Same inputs as latestReviewedAt in lib/serviceReviewedAt.ts, in SQL so
    // the sitemap does not load every service's events. Keep the two in step.
    const services = await prisma.$queryRaw<SitemapRow[]>`
      SELECT s.slug, s."listedAt", s."createdAt",
        GREATEST(
          s."approvedAt",
          s."verifiedAt",
          s."tosReviewAt",
          (SELECT MAX(e."updatedAt") FROM "Event" e
            WHERE e."serviceId" = s.id AND e.visible AND e."deletedAt" IS NULL),
          (SELECT MAX(v."updatedAt") FROM "VerificationStep" v WHERE v."serviceId" = s.id)
        ) AS "reviewedAt"
      FROM "Service" s
      WHERE s."serviceVisibility" IN ('PUBLIC', 'ARCHIVED')
      ORDER BY "reviewedAt" DESC NULLS LAST, s.slug
    `

    const origin = site.origin
    const now = Date.now()
    const urls = services
      .map((service) => {
        const loc = he.encode(`${origin}/service/${service.slug}`)
        const modifiedAt = service.reviewedAt ?? service.listedAt ?? service.createdAt
        const lastmod = modifiedAt.toISOString().slice(0, 10)
        const daysSinceUpdate = (now - modifiedAt.getTime()) / (1000 * 60 * 60 * 24)
        const changefreq = daysSinceUpdate < 7 ? 'daily' : daysSinceUpdate < 30 ? 'weekly' : 'monthly'
        const priority = daysSinceUpdate < 30 ? '0.8' : '0.6'
        return `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`
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
    console.error('Failed to generate services sitemap:', error)
    return new Response('Failed to generate services sitemap', { status: 500 })
  }
}
