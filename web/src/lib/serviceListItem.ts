import type { Prisma } from '@prisma/client'

export const serviceListItemSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  overallScore: true,
  privacyScore: true,
  trustScore: true,
  kycLevel: true,
  imageUrl: true,
  verificationStatus: true,
  acceptedCurrencies: true,
  serviceVisibility: true,
  serviceUrls: true,
  referral: true,
  onionUrls: true,
  categories: {
    select: {
      name: true,
      icon: true,
    },
  },
} satisfies Prisma.ServiceSelect

export type ServiceListItem = Prisma.ServiceGetPayload<{ select: typeof serviceListItemSelect }>
