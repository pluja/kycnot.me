import { ogImageTemplates } from '../../components/OgImage'
import { prisma } from '../../lib/prisma'
import { isBadgeSize, isBadgeTheme, isEmbeddableBadgeStatus } from '../../lib/serviceBadges'

import type { APIRoute } from 'astro'

export const prerender = false

export const GET: APIRoute = async (context) => {
  const { slug } = context.params
  if (!slug) return context.rewrite('/404')

  const sizeParam = context.url.searchParams.get('size') ?? 'sm'
  const size = isBadgeSize(sizeParam) ? sizeParam : 'sm'
  const themeParam = context.url.searchParams.get('theme') ?? 'dark'
  const theme = isBadgeTheme(themeParam) ? themeParam : 'dark'
  const showScore = context.url.searchParams.get('score') === '1'
  const showRating = context.url.searchParams.get('rating') === '1'
  const showKycLevel = context.url.searchParams.get('kyc') === '1'

  const service = await prisma.service.findUnique({
    where: { slug, serviceVisibility: 'PUBLIC' },
    select: {
      name: true,
      overallScore: true,
      averageUserRating: true,
      verificationStatus: true,
      kycLevel: true,
    },
  })

  if (!service) return context.rewrite('/404')
  if (!isEmbeddableBadgeStatus(service.verificationStatus)) {
    return new Response(null, { status: 404 })
  }

  const templateKey = `badge-${size}` as const
  const baseProps = { verificationStatus: service.verificationStatus, theme }

  try {
    const response =
      size === 'lg'
        ? await ogImageTemplates['badge-lg'](
            {
              ...baseProps,
              name: service.name,
              overallScore: service.overallScore,
              averageUserRating: service.averageUserRating,
              kycLevel: service.kycLevel,
              showScore,
              showRating,
              showKycLevel,
            },
            context
          )
        : size === 'sm'
          ? await ogImageTemplates['badge-sm'](
              {
                ...baseProps,
                overallScore: service.overallScore,
                averageUserRating: service.averageUserRating,
                kycLevel: service.kycLevel,
                showScore,
                showRating,
                showKycLevel,
              },
              context
            )
          : await ogImageTemplates['badge-xs'](baseProps, context)

    if (response === null) {
      return new Response('Render failed', { status: 500 })
    }

    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')

    return new Response(response.body, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error(`[badge] Failed to render ${templateKey} for ${slug}:`, error)
    return new Response('Render failed', { status: 500 })
  }
}
