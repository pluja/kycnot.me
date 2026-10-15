import { ServiceVisibility } from '@prisma/client'
import he from 'he'
import { orderBy } from 'lodash-es'

import { prisma } from '../../lib/prisma'
import { latestReviewedAt } from '../../lib/serviceReviewedAt'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ site }) => {
  if (!site) return new Response('Site URL not configured', { status: 500 })

  try {
    const listed = { serviceVisibility: { in: [ServiceVisibility.PUBLIC, ServiceVisibility.ARCHIVED] } }
    // The latest event and test date per service is all latestReviewedAt needs, so they are grouped in SQL.
    const [services, latestEvents, latestSteps] = await Promise.all([
      prisma.service.findMany({
        where: listed,
        select: {
          id: true,
          slug: true,
          listedAt: true,
          createdAt: true,
          approvedAt: true,
          verifiedAt: true,
          tosReviewAt: true,
        },
      }),
      prisma.event.groupBy({
        by: ['serviceId'],
        where: { visible: true, deletedAt: null, service: listed },
        _max: { updatedAt: true },
      }),
      prisma.verificationStep.groupBy({
        by: ['serviceId'],
        where: { service: listed },
        _max: { updatedAt: true },
      }),
    ])
    const latest = (groups: { serviceId: number | null; _max: { updatedAt: Date | null } }[], id: number) => {
      const updatedAt = groups.find((group) => group.serviceId === id)?._max.updatedAt
      return updatedAt ? [{ updatedAt }] : []
    }
    const rows = orderBy(
      services.map((service) => ({
        ...service,
        reviewedAt: latestReviewedAt({
          ...service,
          events: latest(latestEvents, service.id),
          verificationSteps: latest(latestSteps, service.id),
        }),
      })),
      [(service) => service.reviewedAt?.getTime() ?? -Infinity, 'slug'],
      ['desc', 'asc']
    )

    const origin = site.origin
    const now = Date.now()
    const urls = rows
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
