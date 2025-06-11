import { orderBy } from 'lodash-es'

import { getAttributeCategoryInfo } from '../constants/attributeCategories'
import { getAttributeTypeInfo } from '../constants/attributeTypes'
import { getKycLevelClarificationInfo, kycLevelClarifications } from '../constants/kycLevelClarifications'
import { kycLevels } from '../constants/kycLevels'
import { serviceVisibilitiesById } from '../constants/serviceVisibility'
import { READ_MORE_SENTENCE_LINK, verificationStatusesByValue } from '../constants/verificationStatus'

import { formatDateShort } from './timeAgo'

import type { Prisma } from '@prisma/client'

type NonDbAttribute = Prisma.AttributeGetPayload<{
  select: {
    title: true
    type: true
    category: true
    description: true
    privacyPoints: true
    trustPoints: true
  }
}> & {
  slug: string
  links: {
    url: string
    label: string
    icon: string
  }[]
}

type NonDbAttributeFull = NonDbAttribute & {
  customize: (
    service: Prisma.ServiceGetPayload<{
      select: {
        verificationStatus: true
        serviceVisibility: true
        isRecentlyListed: true
        listedAt: true
        createdAt: true
        tosReviewAt: true
        tosReview: true
        onionUrls: true
        i2pUrls: true
        acceptedCurrencies: true
        kycLevel: true
        kycLevelClarification: true
      }
    }>
  ) => Partial<Pick<NonDbAttribute, 'description' | 'title'>> & {
    show: boolean
  }
}

export const nonDbAttributes: NonDbAttributeFull[] = [
  {
    slug: 'verification-verified',
    title: 'Verified',
    type: 'GOOD',
    category: 'TRUST',
    description: `${verificationStatusesByValue.VERIFICATION_SUCCESS.description} ${READ_MORE_SENTENCE_LINK}`,
    privacyPoints: verificationStatusesByValue.VERIFICATION_SUCCESS.privacyPoints,
    trustPoints: verificationStatusesByValue.VERIFICATION_SUCCESS.trustPoints,
    links: [
      {
        url: '/?verification=verified',
        label: 'Search with this',
        icon: 'ri:search-line',
      },
    ],
    customize: (service) => ({
      show: service.verificationStatus === 'VERIFICATION_SUCCESS',
      description: `${verificationStatusesByValue.VERIFICATION_SUCCESS.description} ${READ_MORE_SENTENCE_LINK}\n\nCheck out the [proof](#verification).`,
    }),
  },
  {
    slug: 'verification-approved',
    title: 'Approved',
    type: 'INFO',
    category: 'TRUST',
    description: `${verificationStatusesByValue.APPROVED.description} ${READ_MORE_SENTENCE_LINK}`,
    privacyPoints: verificationStatusesByValue.APPROVED.privacyPoints,
    trustPoints: verificationStatusesByValue.APPROVED.trustPoints,
    links: [
      {
        url: '/?verification=verified&verification=approved',
        label: 'Search with this',
        icon: 'ri:search-line',
      },
    ],
    customize: (service) => ({
      show: service.verificationStatus === 'APPROVED',
    }),
  },
  {
    slug: 'verification-community-contributed',
    title: 'Community contributed',
    type: 'WARNING',
    category: 'TRUST',
    description: `${verificationStatusesByValue.COMMUNITY_CONTRIBUTED.description} ${READ_MORE_SENTENCE_LINK}`,
    privacyPoints: verificationStatusesByValue.COMMUNITY_CONTRIBUTED.privacyPoints,
    trustPoints: verificationStatusesByValue.COMMUNITY_CONTRIBUTED.trustPoints,
    links: [
      {
        url: '/?verification=community',
        label: 'With this',
        icon: 'ri:search-line',
      },
      {
        url: '/?verification=verified&verification=approved',
        label: 'Without this',
        icon: 'ri:search-line',
      },
    ],
    customize: (service) => ({
      show: service.verificationStatus === 'COMMUNITY_CONTRIBUTED',
    }),
  },
  {
    slug: 'verification-scam',
    title: 'Is SCAM',
    type: 'BAD',
    category: 'TRUST',
    description: `${verificationStatusesByValue.VERIFICATION_FAILED.description} ${READ_MORE_SENTENCE_LINK}`,
    privacyPoints: verificationStatusesByValue.VERIFICATION_FAILED.privacyPoints,
    trustPoints: verificationStatusesByValue.VERIFICATION_FAILED.trustPoints,
    links: [
      {
        url: '/?verification=scam',
        label: 'With this',
        icon: 'ri:search-line',
      },
      {
        url: '/?verification=verified&verification=approved',
        label: 'Without this',
        icon: 'ri:search-line',
      },
    ],
    customize: (service) => ({
      show: service.verificationStatus === 'VERIFICATION_FAILED',
      description: `${verificationStatusesByValue.VERIFICATION_FAILED.description} ${READ_MORE_SENTENCE_LINK}\n\nCheck out the [proof](#verification).`,
    }),
  },
  ...kycLevels.map<NonDbAttributeFull>((kycLevel) => ({
    slug: `kyc-level-${kycLevel.id}`,
    title: kycLevel.name,
    type: kycLevel.attributeType,
    category: 'PRIVACY',
    description: kycLevel.description,
    privacyPoints: kycLevel.privacyPoints,
    trustPoints: 0,
    links: [
      {
        url: `/?max-kyc=${kycLevel.id}`,
        label: 'With this or better',
        icon: 'ri:search-line',
      },
    ],
    customize: (service) => {
      const clarification = getKycLevelClarificationInfo(service.kycLevelClarification)
      return {
        show: service.kycLevel === kycLevel.value,
        title: kycLevel.name + (clarification.value !== 'NONE' ? ` (${clarification.label})` : ''),
        description:
          kycLevel.description + (clarification.value !== 'NONE' ? ` ${clarification.description}` : ''),
      }
    },
  })),
  ...kycLevelClarifications
    .filter((clarification) => clarification.value !== 'NONE')
    .map<NonDbAttributeFull>((clarification) => ({
      slug: `kyc-clarification-${clarification.slug}`,
      title: `KYC ${clarification.label}`,
      type: clarification.attributeType,
      category: 'PRIVACY',
      description: clarification.description,
      privacyPoints: clarification.privacyPoints,
      trustPoints: 0,
      links: [],
      customize: (service) => ({
        show: service.kycLevelClarification === clarification.value,
      }),
    })),
  {
    slug: 'archived',
    title: serviceVisibilitiesById.ARCHIVED.label,
    type: 'WARNING',
    category: 'TRUST',
    description: serviceVisibilitiesById.ARCHIVED.longDescription,
    privacyPoints: 0,
    trustPoints: 0,
    links: [],
    customize: (service) => ({
      show: service.serviceVisibility === 'ARCHIVED',
    }),
  },
  {
    slug: 'recently-listed',
    title: 'Recently listed',
    type: 'WARNING',
    category: 'TRUST',
    description: 'Listed on KYCnot.me less than 15 days ago. Proceed with caution.',
    privacyPoints: 0,
    trustPoints: -5,
    links: [],
    customize: (service) => ({
      show: service.isRecentlyListed,
      description: `Listed on KYCnot.me ${formatDateShort(service.listedAt ?? service.createdAt)}. Proceed with caution.`,
    }),
  },
  {
    slug: 'cannot-analyse-tos',
    title: "Can't analyse ToS",
    type: 'WARNING',
    category: 'TRUST',
    description:
      'The Terms of Service page is not analyable by our AI. Possible reasons may be: captchas, client side rendering, DDoS protections, or non-text format.',
    privacyPoints: 0,
    trustPoints: -3,
    links: [],
    customize: (service) => ({
      show: service.tosReviewAt !== null && service.tosReview === null,
    }),
  },
  {
    slug: 'has-onion-urls',
    title: 'Has Onion URLs',
    type: 'GOOD',
    category: 'PRIVACY',
    description: 'Onion (Tor) URLs enhance privacy and anonymity.',
    privacyPoints: 5,
    trustPoints: 0,
    links: [
      {
        url: '/?onion=true',
        label: 'Search with this',
        icon: 'ri:search-line',
      },
    ],
    customize: (service) => ({
      show: service.onionUrls.length > 0,
    }),
  },
  {
    slug: 'has-i2p-urls',
    title: 'Has I2P URLs',
    type: 'GOOD',
    category: 'PRIVACY',
    description: 'I2P URLs enhance privacy and anonymity.',
    privacyPoints: 5,
    trustPoints: 0,
    links: [
      {
        url: '/?i2p=true',
        label: 'Search with this',
        icon: 'ri:search-line',
      },
    ],
    customize: (service) => ({
      show: service.i2pUrls.length > 0,
    }),
  },
  {
    slug: 'monero-accepted',
    title: 'Accepts Monero',
    type: 'GOOD',
    category: 'PRIVACY',
    description:
      'This service accepts Monero, a privacy-focused cryptocurrency that provides enhanced anonymity.',
    privacyPoints: 5,
    trustPoints: 0,
    links: [
      {
        url: '/?currency=monero',
        label: 'Search with this',
        icon: 'ri:search-line',
      },
    ],
    customize: (service) => ({
      show: service.acceptedCurrencies.includes('MONERO'),
    }),
  },
]

export function sortAttributes<
  T extends Prisma.AttributeGetPayload<{
    select: {
      title: true
      privacyPoints: true
      trustPoints: true
      category: true
      type: true
    }
  }>,
>(attributes: T[]): T[] {
  return orderBy(
    attributes,
    [
      ({ privacyPoints, trustPoints }) => (privacyPoints + trustPoints < 0 ? 1 : 2),
      ({ privacyPoints, trustPoints }) => Math.abs(privacyPoints + trustPoints),
      ({ type }) => getAttributeTypeInfo(type).order,
      ({ category }) => getAttributeCategoryInfo(category).order,
      'title',
    ],
    ['asc', 'desc', 'asc', 'asc', 'asc']
  )
}

export function makeNonDbAttributes(
  service: Parameters<NonDbAttributeFull['customize']>[0],
  { filter = false }: { filter?: boolean } = {}
) {
  const attributes = nonDbAttributes.map(({ customize, ...attribute }) => ({
    ...attribute,
    ...customize(service),
  }))

  if (filter) return attributes.filter(({ show }) => show)

  return attributes
}
