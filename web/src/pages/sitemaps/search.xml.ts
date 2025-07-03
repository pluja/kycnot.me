/* eslint-disable import/no-named-as-default-member */
import he from 'he'

import { prisma } from '../../lib/prisma'
import { makeSearchFiltersOptions } from '../../lib/searchFiltersOptions'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    return new Response('Site URL not configured', { status: 500 })
  }

  const searchUrls = await generateSEOSitemapUrls(site.href)

  const result = `
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${searchUrls.map((url) => `<url><loc>${he.encode(url)}</loc></url>`).join('\n')}
</urlset>
  `.trim()

  return new Response(result, {
    headers: {
      'Content-Type': 'application/xml',
    },
  })
}

async function generateSEOSitemapUrls(siteUrl: string) {
  try {
    const [categories, attributes] = await Promise.all([
      prisma.category.findMany({
        select: {
          name: true,
          namePluralLong: true,
          slug: true,
          icon: true,
          _count: {
            select: {
              services: {
                where: {
                  serviceVisibility: { in: ['PUBLIC', 'ARCHIVED'] },
                },
              },
            },
          },
        },
      }),
      prisma.attribute.findMany({
        select: {
          id: true,
          slug: true,
          title: true,
          category: true,
          type: true,
          _count: {
            select: {
              services: {
                where: {
                  service: {
                    serviceVisibility: { in: ['PUBLIC', 'ARCHIVED'] },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ category: 'asc' }, { type: 'asc' }, { title: 'asc' }],
      }),
    ])

    const filtersOptions = makeSearchFiltersOptions({
      filters: null,
      categories,
      attributes,
    })

    const byCategory = filtersOptions.categories.map(
      (category) =>
        new URLSearchParams({
          categories: category.slug,
        })
    )

    const byVerificationStatus = filtersOptions.verification.map(
      (status) =>
        new URLSearchParams({
          verification: status.slug,
        })
    )

    const byKycLevel = filtersOptions.kycLevels.map(
      (level) =>
        new URLSearchParams({
          'max-kyc': level.id,
        })
    )

    const byCurrency = filtersOptions.currencies.map(
      (currency) =>
        new URLSearchParams({
          currencies: currency.slug,
        })
    )

    const withOneAttribute = filtersOptions.attributesByCategory
      .flatMap(({ attributes }) => attributes)
      .map(
        (attribute) =>
          new URLSearchParams({
            [`attr-${attribute.id.toString()}`]: 'yes',
          })
      )
    const withoutOneAttribute = filtersOptions.attributesByCategory
      .flatMap(({ attributes }) => attributes)
      .map(
        (attribute) =>
          new URLSearchParams({
            [`attr-${attribute.id.toString()}`]: 'no',
          })
      )

    const byCategoryAndCurrency = filtersOptions.categories.flatMap((category) =>
      filtersOptions.currencies.map(
        (currency) =>
          new URLSearchParams({
            categories: category.slug,
            currencies: currency.slug,
          })
      )
    )

    const byCategoryAndAttributes = filtersOptions.categories.flatMap((category) =>
      filtersOptions.attributesByCategory
        .flatMap(({ attributes }) => attributes)
        .flatMap((attribute) => [
          new URLSearchParams({
            categories: category.slug,
            [`attr-${attribute.id.toString()}`]: 'yes',
          }),
          new URLSearchParams({
            categories: category.slug,
            [`attr-${attribute.id.toString()}`]: 'no',
          }),
        ])
    )

    const relevantCurrencies = [
      'xmr',
      'btc',
    ] as const satisfies (typeof filtersOptions.currencies)[number]['slug'][]

    const byCategoryAndAttributesAndRelevantCurrency = filtersOptions.categories.flatMap((category) =>
      filtersOptions.attributesByCategory
        .flatMap(({ attributes }) => attributes)
        .flatMap((attribute) =>
          relevantCurrencies.map(
            (currency) =>
              new URLSearchParams({
                categories: category.slug,
                currencies: currency,
                [`attr-${attribute.id.toString()}`]:
                  attribute.type === 'GOOD' || attribute.type === 'INFO' ? 'yes' : 'no',
              })
          )
        )
    )

    const allQueryParams = [
      ...byCategory,
      ...byVerificationStatus,
      ...byKycLevel,
      ...byCurrency,
      ...withOneAttribute,
      ...withoutOneAttribute,

      ...byCategoryAndCurrency,
      ...byCategoryAndAttributes,
      ...byCategoryAndAttributesAndRelevantCurrency,
    ] satisfies URLSearchParams[]

    return allQueryParams.map((queryParams) => {
      const url = new URL(siteUrl)
      url.search = queryParams.toString()
      return url.href
    })
  } catch (error) {
    console.error('Failed to generate SEO sitemap URLs:', error)
    return []
  }
}
