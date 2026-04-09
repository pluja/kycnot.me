/* eslint-disable import/no-named-as-default-member */
import he from 'he'

import { getCurrencyInfo } from '../../constants/currencies'
import { prisma } from '../../lib/prisma'

import type { APIRoute } from 'astro'

const CURATED_CATEGORY_CURRENCY_SLUGS = ['btc', 'xmr', 'cash', 'fiat'] as const
const CURATED_MULTI_CURRENCY_COMBINATIONS = [['btc', 'xmr']] as const
const MIN_RESULTS_FOR_CURATED_COMBINATION = 3

export const GET: APIRoute = async ({ site }) => {
  if (!site) return new Response('Site URL not configured', { status: 500 })

  try {
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
  } catch (error) {
    console.error('Failed to generate SEO sitemap URLs:', error)
    return new Response('Failed to generate SEO sitemap URLs', { status: 500 })
  }
}

async function generateSEOSitemapUrls(siteUrl: string) {
  const [categories, services] = await Promise.all([
    prisma.category.findMany({
      select: {
        slug: true,
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
    prisma.service.findMany({
      where: {
        serviceVisibility: { in: ['PUBLIC', 'ARCHIVED'] },
      },
      select: {
        acceptedCurrencies: true,
        categories: {
          select: {
            slug: true,
          },
        },
      },
    }),
  ])

  const visibleCategories = categories.filter((category) => category._count.services > 0)
  const currencyCounts = new Map<string, number>()
  const categoryCurrencyCounts = new Map<string, number>()
  const categoryDualCurrencyCounts = new Map<string, number>()

  for (const service of services) {
    const currencySlugs = Array.from(
      new Set(service.acceptedCurrencies.map((currency) => getCurrencyInfo(currency).slug))
    ).sort()

    for (const currencySlug of currencySlugs) {
      currencyCounts.set(currencySlug, (currencyCounts.get(currencySlug) ?? 0) + 1)
    }

    for (const category of service.categories) {
      for (const currencySlug of currencySlugs) {
        const key = `${category.slug}:${currencySlug}`
        categoryCurrencyCounts.set(key, (categoryCurrencyCounts.get(key) ?? 0) + 1)
      }

      for (const currencyCombination of CURATED_MULTI_CURRENCY_COMBINATIONS) {
        if (!currencyCombination.every((currencySlug) => currencySlugs.includes(currencySlug))) continue

        const key = `${category.slug}:${currencyCombination.join('+')}`
        categoryDualCurrencyCounts.set(key, (categoryDualCurrencyCounts.get(key) ?? 0) + 1)
      }
    }
  }

  const searchUrls = new Set<string>()

  for (const category of visibleCategories) {
    searchUrls.add(makeSearchUrl(siteUrl, [['categories', category.slug]]))
  }

  for (const currencySlug of Array.from(currencyCounts.keys()).sort()) {
    searchUrls.add(makeSearchUrl(siteUrl, [['currencies', currencySlug]]))
  }

  for (const category of visibleCategories) {
    for (const currencySlug of CURATED_CATEGORY_CURRENCY_SLUGS) {
      const count = categoryCurrencyCounts.get(`${category.slug}:${currencySlug}`) ?? 0
      if (count < MIN_RESULTS_FOR_CURATED_COMBINATION) continue

      searchUrls.add(
        makeSearchUrl(siteUrl, [
          ['categories', category.slug],
          ['currencies', currencySlug],
        ])
      )
    }

    for (const currencyCombination of CURATED_MULTI_CURRENCY_COMBINATIONS) {
      const key = `${category.slug}:${currencyCombination.join('+')}`
      const count = categoryDualCurrencyCounts.get(key) ?? 0
      if (count < MIN_RESULTS_FOR_CURATED_COMBINATION) continue

      searchUrls.add(
        makeSearchUrl(siteUrl, [
          ['categories', category.slug],
          ...currencyCombination.map((currencySlug) => ['currencies', currencySlug] as [string, string]),
          ['currency-mode', 'and'],
        ])
      )
    }
  }

  return Array.from(searchUrls)
}

function makeSearchUrl(siteUrl: string, entries: [string, string][]) {
  const url = new URL(siteUrl)
  const searchParams = new URLSearchParams()
  const sortedEntries = [...entries].sort(([firstKey, firstValue], [secondKey, secondValue]) =>
    firstKey === secondKey ? firstValue.localeCompare(secondValue) : firstKey.localeCompare(secondKey)
  )

  for (const [key, value] of sortedEntries) {
    searchParams.append(key, value)
  }

  url.search = searchParams.toString()
  return url.href
}
