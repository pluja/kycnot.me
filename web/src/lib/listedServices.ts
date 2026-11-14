import { verificationStatuses } from '../constants/verificationStatus'

import type { Prisma } from '@prisma/client'

// listedServiceWhere is what the directory lists with no verification filter
// set, so a count built on it matches what a link to the listing shows.
export const listedServiceWhere = {
  serviceVisibility: { in: ['PUBLIC', 'ARCHIVED'] },
  verificationStatus: {
    in: verificationStatuses.filter((status) => status.default).map((status) => status.value),
  },
} satisfies Prisma.ServiceWhereInput
