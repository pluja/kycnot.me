import { orderBy } from 'lodash-es'

import { getAttributeCategoryInfo } from '../constants/attributeCategories'
import { getAttributeTypeInfo } from '../constants/attributeTypes'
import { serviceVisibilitiesById } from '../constants/serviceVisibility'
import { READ_MORE_SENTENCE_LINK, verificationStatusesByValue } from '../constants/verificationStatus'

import { formatDateShort } from './timeAgo'

import type { Prisma } from '@prisma/client'

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
  service: Prisma.ServiceGetPayload<{
    select: {
      verificationStatus: true
      serviceVisibility: true
      isRecentlyListed: true
      listedAt: true
      createdAt: true
    }
  }>,
  { filter = false }: { filter?: boolean } = {}
) {
  const nonDbAttributes: (Prisma.AttributeGetPayload<{
    select: {
      title: true
      type: true
      category: true
      description: true
      privacyPoints: true
      trustPoints: true
    }
  }> & {
    show: boolean
    links: {
      url: string
      label: string
      icon: string
    }[]
  })[] = [
    {
      title: 'Verified',
      show: service.verificationStatus === 'VERIFICATION_SUCCESS',
      type: 'GOOD',
      category: 'TRUST',
      description: `${verificationStatusesByValue.VERIFICATION_SUCCESS.description} ${READ_MORE_SENTENCE_LINK}\n\nCheck out the [proof](#verification).`,
      privacyPoints: verificationStatusesByValue.VERIFICATION_SUCCESS.privacyPoints,
      trustPoints: verificationStatusesByValue.VERIFICATION_SUCCESS.trustPoints,
      links: [
        {
          url: '/?verification=verified',
          label: 'Search with this',
          icon: 'ri:search-line',
        },
      ],
    },
    {
      title: 'Approved',
      show: service.verificationStatus === 'APPROVED',
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
    },
    {
      title: 'Community contributed',
      show: service.verificationStatus === 'COMMUNITY_CONTRIBUTED',
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
    },
    {
      title: 'Is SCAM',
      show: service.verificationStatus === 'VERIFICATION_FAILED',
      type: 'BAD',
      category: 'TRUST',
      description: `${verificationStatusesByValue.VERIFICATION_FAILED.description} ${READ_MORE_SENTENCE_LINK}\n\nCheck out the [proof](#verification).`,
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
    },
    {
      title: serviceVisibilitiesById.ARCHIVED.label,
      show: service.serviceVisibility === 'ARCHIVED',
      type: 'WARNING',
      category: 'TRUST',
      description: serviceVisibilitiesById.ARCHIVED.longDescription,
      privacyPoints: 0,
      trustPoints: 0,
      links: [],
    },
    {
      title: 'Recently listed',
      show: service.isRecentlyListed,
      type: 'WARNING',
      category: 'TRUST',
      description: `Listed on KYCnot.me ${formatDateShort(service.listedAt ?? service.createdAt)}. Proceed with caution.`,
      privacyPoints: 0,
      trustPoints: -5,
      links: [],
    },
  ]

  if (filter) return nonDbAttributes.filter(({ show }) => show)

  return nonDbAttributes
}
