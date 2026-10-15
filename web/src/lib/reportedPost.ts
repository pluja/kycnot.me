import { publicEvidenceSelect } from './experienceQueries'

import type { Prisma } from '@prisma/client'

export const reportedPostThreadSelect = {
  id: true,
  category: true,
  reportReason: true,
  fromService: true,
  reportOutcome: true,
  reportOutcomeNote: true,
  comment: {
    select: {
      id: true,
      content: true,
      status: true,
      kind: true,
      parentId: true,
      createdAt: true,
      author: { select: { name: true, displayName: true, picture: true } },
      parent: { select: { content: true, author: { select: { name: true, displayName: true } } } },
      service: { select: { name: true, slug: true, serviceVisibility: true } },
      evidence: { select: publicEvidenceSelect },
    },
  },
} satisfies Prisma.ContactThreadSelect
