// JSON-LD schema builders for the /swap page. The pure helpers live in
// swapPageInfoCore.ts so node:test can import them without hitting
// astro:env/client.

import { KYCNOTME_SCHEMA_MINI } from '../schema'
import { absoluteSiteUrl } from '../urls'

import {
  faqAnswerToPlainText,
  FAQ_ITEMS,
  formatCurrencyHumanName,
  type SwapPair,
} from './swapPageInfoCore'

import type {
  FAQPage,
  Organization,
  Question,
  WebApplication,
  WithContext,
} from 'schema-dts'

export * from './swapPageInfoCore'

export function buildOrganizationSchema(): WithContext<Organization> {
  return {
    '@context': 'https://schema.org',
    ...KYCNOTME_SCHEMA_MINI,
    logo: absoluteSiteUrl('/favicon.svg'),
  }
}

export function buildWebApplicationSchema(
  canonicalPath: string,
  description: string
): WithContext<WebApplication> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'KYCnot.me Swap Rate Comparison',
    url: absoluteSiteUrl(canonicalPath),
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    description,
    inLanguage: 'en',
    provider: KYCNOTME_SCHEMA_MINI,
    featureList: [
      'KYC-free exchange comparison',
      'Aggregator takes no custody of funds',
      'Real-time aggregated rates',
      'Best-price sorting',
      'Multi-provider support',
    ],
  }
}

export function buildFaqSchema(): WithContext<FAQPage> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(
      ({ q, a }) =>
        ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faqAnswerToPlainText(a),
          },
        }) satisfies Question
    ),
  }
}

export type BreadcrumbItem = { name: string; url?: string }

// Matches the blog convention: Home > Section > Item. Pair pages add a
// third level naming the curated pair.
export function buildBreadcrumbs(pair: SwapPair | null): BreadcrumbItem[] {
  if (!pair) {
    return [
      { name: 'Home', url: '/' },
      { name: 'Swap' },
    ]
  }
  return [
    { name: 'Home', url: '/' },
    { name: 'Swap', url: '/swap' },
    { name: `${formatCurrencyHumanName(pair.from)} to ${formatCurrencyHumanName(pair.to)}` },
  ]
}
