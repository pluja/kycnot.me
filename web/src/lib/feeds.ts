import { prisma } from './prisma'

import type { Prisma } from '@prisma/client'

type SafeResult<T> =
  | {
      success: false
      error: { message: string; responseInit: ResponseInit }
      data?: undefined
    }
  | {
      success: true
      error?: undefined
      data: T
    }

export const takeCounts = {
  serviceComments: 100,
  serviceEvents: 100,
  allEvents: 100,
  userNotifications: 50,
} as const satisfies Record<string, number>

const serviceSelect = {
  id: true,
  name: true,
  slug: true,
} as const satisfies Prisma.ServiceSelect

export async function getService(slug: string | undefined): Promise<
  SafeResult<{
    service: Prisma.ServiceGetPayload<{ select: typeof serviceSelect }>
  }>
> {
  if (!slug || typeof slug !== 'string') {
    return { success: false, error: { message: 'Invalid slug', responseInit: { status: 400 } } }
  }

  const service =
    (await prisma.service.findFirst({
      where: {
        serviceVisibility: { in: ['PUBLIC', 'ARCHIVED', 'UNLISTED'] },
        slug,
      },
      select: serviceSelect,
    })) ??
    (await prisma.service.findFirst({
      where: {
        serviceVisibility: { in: ['PUBLIC', 'ARCHIVED', 'UNLISTED'] },
        previousSlugs: { has: slug },
      },
      select: serviceSelect,
    }))

  if (!service) {
    return { success: false, error: { message: 'Service not found', responseInit: { status: 404 } } }
  }

  return { success: true, data: { service } }
}

const serviceCommentSelect = {
  id: true,
  content: true,
  rating: true,
  ratingActive: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      name: true,
      displayName: true,
      verified: true,
      admin: true,
      capabilities: true,
      spammer: true,
      serviceAffiliations: {
        select: {
          role: true,
          service: { select: { name: true, slug: true } },
        },
      },
    },
  },
} as const satisfies Prisma.CommentSelect

export async function getCommentsForService(slug: string | undefined): Promise<
  SafeResult<{
    service: Prisma.ServiceGetPayload<{ select: typeof serviceSelect }>
    comments: Prisma.CommentGetPayload<{ select: typeof serviceCommentSelect }>[]
  }>
> {
  const result = await getService(slug)
  if (!result.success) return result
  const { service } = result.data

  const comments = await prisma.comment.findMany({
    where: {
      serviceId: service.id,
      status: { in: ['APPROVED', 'VERIFIED'] },
      ratingMuted: false,
      parentId: null, // Only root comments for the main feed
    },
    select: serviceCommentSelect,
    orderBy: {
      createdAt: 'desc',
    },
    take: takeCounts.serviceComments,
  })

  return { success: true, data: { service, comments } }
}

const eventSelect = {
  id: true,
  title: true,
  content: true,
  type: true,
  class: true,
  sentiment: true,
  origin: true,
  startedAt: true,
  endedAt: true,
  source: true,
  createdAt: true,
  incident: {
    select: { severity: true, state: true, resolvedAt: true },
  },
  service: {
    select: {
      name: true,
      slug: true,
    },
  },
} as const satisfies Prisma.EventSelect

const serviceEventSelect = {
  id: true,
  title: true,
  content: true,
  type: true,
  class: true,
  sentiment: true,
  origin: true,
  startedAt: true,
  endedAt: true,
  source: true,
  createdAt: true,
  incident: {
    select: { state: true },
  },
} as const satisfies Prisma.EventSelect

export async function getEventsForService(slug: string | undefined): Promise<
  SafeResult<{
    service: Prisma.ServiceGetPayload<{ select: typeof serviceSelect }>
    events: Prisma.EventGetPayload<{ select: typeof serviceEventSelect }>[]
  }>
> {
  const result = await getService(slug)
  if (!result.success) return result
  const { service } = result.data

  const events = await prisma.event.findMany({
    where: {
      serviceId: service.id,
      visible: true,
      deletedAt: null,
      class: { in: ['EVENT', 'INCIDENT'] },
    },
    select: serviceEventSelect,
    orderBy: {
      createdAt: 'desc',
    },
    take: takeCounts.serviceEvents,
  })

  return { success: true, data: { service, events } }
}

// Feed views over the events taxonomy. `curated` mirrors the /events default
// (real events + incidents, hiding the ~2k auto-recorded service changes).
export const eventFeedViews = ['curated', 'incidents', 'alerts', 'all'] as const
export type EventFeedView = (typeof eventFeedViews)[number]

export function isEventFeedView(value: string | null | undefined): value is EventFeedView {
  return value != null && (eventFeedViews as readonly string[]).includes(value)
}

function eventViewWhere(view: EventFeedView): Prisma.EventWhereInput {
  switch (view) {
    case 'incidents':
      return { class: 'INCIDENT' }
    case 'alerts':
      return { OR: [{ class: 'INCIDENT' }, { sentiment: 'NEGATIVE' }] }
    case 'all':
      return {}
    case 'curated':
      return { class: { in: ['EVENT', 'INCIDENT'] } }
  }
}

export async function getEvents(view: EventFeedView = 'curated'): Promise<
  SafeResult<{
    events: Prisma.EventGetPayload<{ select: typeof eventSelect }>[]
  }>
> {
  const events = await prisma.event.findMany({
    where: {
      visible: true,
      deletedAt: null,
      service: {
        serviceVisibility: { in: ['PUBLIC', 'ARCHIVED'] },
      },
      ...eventViewWhere(view),
    },
    select: eventSelect,
    orderBy: {
      createdAt: 'desc',
    },
    take: takeCounts.allEvents,
  })

  return { success: true, data: { events } }
}

const userSelect = {
  id: true,
  name: true,
  displayName: true,
} as const satisfies Prisma.UserSelect

const notificationSelect = {
  id: true,
  type: true,
  createdAt: true,
  aboutAccountStatusChange: true,
  aboutCommentStatusChange: true,
  aboutServiceVerificationStatusChange: true,
  aboutSuggestionStatusChange: true,
  aboutServiceSuggestionId: true,
  aboutComment: {
    select: {
      id: true,
      content: true,
      publicNote: true,
      status: true,
      author: {
        select: {
          id: true,
        },
      },
      parent: {
        select: {
          author: {
            select: {
              id: true,
            },
          },
        },
      },
      service: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
  },
  aboutEvent: {
    select: {
      title: true,
      content: true,
      type: true,
      class: true,
      sentiment: true,
      startedAt: true,
      endedAt: true,
      incident: { select: { state: true } },
      service: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
  },
  aboutService: {
    select: {
      slug: true,
      name: true,
      verificationStatus: true,
    },
  },
  aboutServiceSuggestion: {
    select: {
      id: true,
      type: true,
      status: true,
      service: {
        select: {
          name: true,
        },
      },
    },
  },
  aboutServiceSuggestionMessage: {
    select: {
      id: true,
      content: true,
      suggestion: {
        select: {
          id: true,
          service: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
  aboutContactThreadId: true,
  aboutContactThread: {
    select: {
      authorId: true,
    },
  },
  aboutKarmaTransaction: {
    select: {
      points: true,
      action: true,
      description: true,
    },
  },
} as const satisfies Prisma.NotificationSelect

export async function getUserNotifications(feedId: string | undefined): Promise<
  SafeResult<{
    user: Prisma.UserGetPayload<{ select: typeof userSelect }>
    notifications: Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>[]
  }>
> {
  if (!feedId || typeof feedId !== 'string') {
    return { success: false, error: { message: 'Invalid feed ID', responseInit: { status: 400 } } }
  }

  const user = await prisma.user.findFirst({
    where: { feedId, spammer: false },
    select: userSelect,
  })

  if (!user) {
    return { success: false, error: { message: 'User not found', responseInit: { status: 404 } } }
  }

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
    },
    select: notificationSelect,
    orderBy: {
      createdAt: 'desc',
    },
    take: takeCounts.userNotifications,
  })

  return { success: true, data: { user, notifications } }
}
