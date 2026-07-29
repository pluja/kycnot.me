import type { Prisma } from '@prisma/client'

// serviceDetailSelect is the field set the public service page renders. It is a
// factory rather than a plain const because two relations are scoped to the
// viewer; passing `undefined` for a logged-out visitor would drop the filter
// entirely and return every user's rows, so callers pass an explicit id.
export function serviceDetailSelect(viewerId: number) {
  return {
    id: true,
    slug: true,
    name: true,
    description: true,
    kycLevel: true,
    kycPolicyMd: true,
    overallScore: true,
    privacyScore: true,
    trustScore: true,
    verificationStatus: true,
    serviceVisibility: true,
    verificationSummary: true,
    verificationProofMd: true,
    tosUrls: true,
    serviceUrls: true,
    onionUrls: true,
    i2pUrls: true,
    referral: true,
    imageUrl: true,
    listedAt: true,
    approvedAt: true,
    verifiedAt: true,
    createdAt: true,
    acceptedCurrencies: true,
    operatingSince: true,
    registrationCountryCode: true,
    registeredCompanyName: true,
    tosReview: true,
    tosReviewAt: true,
    userSentiment: true,
    userSentimentAt: true,
    averageUserRating: true,
    trustWeightedUserRating: true,
    userRatingCount: true,
    trustedUserRatingCount: true,
    userRatingWeight: true,
    isRecentlyApproved: true,
    strictCommentingEnabled: true,
    commentSectionMessage: true,
    contactMethods: {
      select: {
        value: true,
        label: true,
      },
    },
    affiliatedUsers: {
      where: { userId: viewerId },
      select: { id: true },
    },
    attributes: {
      select: {
        attribute: {
          select: {
            id: true,
            type: true,
            category: true,
            title: true,
            description: true,
            privacyPoints: true,
            trustPoints: true,
          },
        },
      },
    },
    categories: {
      select: {
        icon: true,
        name: true,
        slug: true,
      },
    },
    events: {
      where: {
        visible: true,
      },
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        class: true,
        sentiment: true,
        startedAt: true,
        endedAt: true,
        source: true,
        incident: {
          select: {
            type: true,
            severity: true,
            state: true,
            occurredAt: true,
            resolvedAt: true,
            outcome: true,
            amountText: true,
            trustOverride: true,
          },
        },
      },
    },
    verificationRequests: {
      select: {
        id: true,
        userId: true,
      },
    },
    verificationSteps: {
      select: {
        title: true,
        description: true,
        status: true,
        evidenceMd: true,
        showBanner: true,
        createdAt: true,
        updatedAt: true,
      },
    },
    internalNotes: {
      select: {
        id: true,
        content: true,
        createdAt: true,
        addedByUser: {
          select: {
            name: true,
            displayName: true,
            picture: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    },
    _count: {
      select: {
        comments: {
          where: {
            ratingActive: true,
            status: {
              in: ['APPROVED', 'VERIFIED'],
            },
            parentId: null,
            ratingMuted: false,
          },
        },
      },
    },
  } satisfies Prisma.ServiceSelect
}

export type ServiceDetail = Prisma.ServiceGetPayload<{
  select: ReturnType<typeof serviceDetailSelect>
}>
