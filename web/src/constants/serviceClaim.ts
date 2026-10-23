import type { Prisma } from '@prisma/client'

export const CLAIM_RECORD_PREFIX = 'kycnotme-verify='
// CLAIM_MAX_FAILED_CHECKS consecutive daily checks without the record remove a DNS-claimed affiliation.
export const CLAIM_MAX_FAILED_CHECKS = 3

// affiliationServiceWhere limits affiliations to listed services.
export const affiliationServiceWhere = {
  serviceVisibility: 'PUBLIC',
} as const satisfies Prisma.ServiceWhereInput

export const isAffiliableService = (service: Pick<Prisma.ServiceGetPayload<object>, 'serviceVisibility'>) =>
  service.serviceVisibility === affiliationServiceWhere.serviceVisibility
