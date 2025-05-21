import { accountStatusChangesById } from '../constants/accountStatusChange'
import { commentStatusChangesById } from '../constants/commentStatusChange'
import { eventTypesById } from '../constants/eventTypes'
import { getKarmaTransactionActionInfo } from '../constants/karmaTransactionActions'
import { serviceVerificationStatusChangesById } from '../constants/serviceStatusChange'
import { serviceSuggestionStatusChangesById } from '../constants/suggestionStatusChange'

import { makeCommentUrl } from './commentsWithReplies'

import type { Prisma } from '@prisma/client'

export function makeNotificationTitle(
  notification: Prisma.NotificationGetPayload<{
    select: {
      type: true
      aboutAccountStatusChange: true
      aboutCommentStatusChange: true
      aboutServiceVerificationStatusChange: true
      aboutSuggestionStatusChange: true
      aboutKarmaTransaction: {
        select: {
          points: true
          action: true
        }
      }
      aboutComment: {
        select: {
          author: { select: { id: true } }
          status: true
          parent: {
            select: {
              author: {
                select: {
                  id: true
                }
              }
            }
          }
          service: {
            select: {
              name: true
            }
          }
        }
      }
      aboutServiceSuggestion: {
        select: {
          status: true
          service: {
            select: {
              name: true
            }
          }
        }
      }
      aboutServiceSuggestionMessage: {
        select: {
          suggestion: {
            select: {
              service: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      }
      aboutEvent: {
        select: {
          type: true
          service: {
            select: {
              name: true
            }
          }
        }
      }
      aboutService: {
        select: {
          name: true
          verificationStatus: true
        }
      }
    }
  }>,
  user: Prisma.UserGetPayload<{ select: { id: true } }> | null
): string {
  switch (notification.type) {
    case 'COMMENT_STATUS_CHANGE': {
      if (!notification.aboutComment) return 'A comment you are watching had a status change'

      if (!notification.aboutCommentStatusChange) {
        return `Comment on ${notification.aboutComment.service.name} had a status change`
      }
      const statusChange = commentStatusChangesById[notification.aboutCommentStatusChange]
      const serviceName = notification.aboutComment.service.name
      const isOwnComment = !!user && notification.aboutComment.author.id === user.id
      const prefix = isOwnComment ? 'Your comment' : 'Watched comment'

      return `${prefix} on ${serviceName} ${statusChange.notificationTitle}`
    }
    case 'REPLY_COMMENT_CREATED': {
      if (!notification.aboutComment) return 'You have a new reply'
      const serviceName = notification.aboutComment.service.name
      if (!notification.aboutComment.parent) {
        return `New reply to a comment on ${serviceName}`
      }
      const isOwnParentComment = !!user && notification.aboutComment.parent.author.id === user.id
      return isOwnParentComment
        ? `New reply to your comment on ${serviceName}`
        : `New reply to a watched comment on ${serviceName}`
    }
    case 'COMMUNITY_NOTE_ADDED': {
      if (!notification.aboutComment) return 'A community note was added'
      const serviceName = notification.aboutComment.service.name
      const isOwnComment = !!user && notification.aboutComment.author.id === user.id
      return isOwnComment
        ? `Community note added to your comment on ${serviceName}`
        : `Community note added to a watched comment on ${serviceName}`
    }
    case 'ROOT_COMMENT_CREATED': {
      if (!notification.aboutComment) return 'New comment'
      const service = notification.aboutComment.service.name
      return notification.aboutComment.status == 'PENDING'
        ? `New unmoderated comment on ${service}`
        : `New comment on ${service}`
    }
    case 'SUGGESTION_MESSAGE': {
      if (!notification.aboutServiceSuggestionMessage) return 'New message on your suggestion'
      const service = notification.aboutServiceSuggestionMessage.suggestion.service.name
      return `New message for ${service} suggestion`
    }
    case 'SUGGESTION_STATUS_CHANGE': {
      if (!notification.aboutServiceSuggestion) return 'Suggestion status updated'
      const service = notification.aboutServiceSuggestion.service.name
      if (!notification.aboutSuggestionStatusChange) {
        return `${service} suggestion status updated`
      }
      const statusChange = serviceSuggestionStatusChangesById[notification.aboutSuggestionStatusChange]
      return `${service} suggestion ${statusChange.notificationTitle}`
    }
    // TODO: [KARMA_UNLOCK] Will be added later, when karma unloks are in the database, not in the code.
    // case 'KARMA_UNLOCK': {
    //   return 'New karma level unlocked'
    // }
    case 'KARMA_CHANGE': {
      if (!notification.aboutKarmaTransaction) return 'Your karma has changed'
      const { points, action } = notification.aboutKarmaTransaction
      const sign = points > 0 ? '+' : ''
      const karmaInfo = getKarmaTransactionActionInfo(action)
      return `${sign}${points.toLocaleString()} karma for ${karmaInfo.label}`
    }
    case 'ACCOUNT_STATUS_CHANGE': {
      if (!notification.aboutAccountStatusChange) return 'Your account status has been updated'
      const accountStatusChange = accountStatusChangesById[notification.aboutAccountStatusChange]
      return accountStatusChange.notificationTitle
    }
    case 'EVENT_CREATED': {
      if (!notification.aboutEvent) return 'New event on a service'
      const service = notification.aboutEvent.service.name
      const eventType = eventTypesById[notification.aboutEvent.type].label
      return `${eventType} event on ${service}`
    }
    case 'SERVICE_VERIFICATION_STATUS_CHANGE': {
      if (!notification.aboutService) return 'Service verification status updated'
      const serviceName = notification.aboutService.name
      if (!notification.aboutServiceVerificationStatusChange) {
        return `${serviceName} verification status updated`
      }
      const statusChange =
        serviceVerificationStatusChangesById[notification.aboutServiceVerificationStatusChange]
      return `${serviceName} ${statusChange.notificationTitle}`
    }
  }
}

export function makeNotificationContent(
  notification: Prisma.NotificationGetPayload<{
    select: {
      type: true
      aboutKarmaTransaction: {
        select: {
          description: true
        }
      }
      aboutComment: {
        select: {
          content: true
          communityNote: true
        }
      }
      aboutServiceSuggestionMessage: {
        select: {
          content: true
        }
      }
      aboutEvent: {
        select: {
          title: true
        }
      }
    }
  }>
): string | null {
  switch (notification.type) {
    // TODO: [KARMA_UNLOCK] Will be added later, when karma unloks are in the database, not in the code.
    // case 'KARMA_UNLOCK':
    case 'KARMA_CHANGE': {
      if (!notification.aboutKarmaTransaction) return null
      return notification.aboutKarmaTransaction.description
    }
    case 'SUGGESTION_STATUS_CHANGE':
    case 'ACCOUNT_STATUS_CHANGE':
    case 'SERVICE_VERIFICATION_STATUS_CHANGE': {
      return null
    }
    case 'COMMENT_STATUS_CHANGE':
    case 'REPLY_COMMENT_CREATED':
    case 'ROOT_COMMENT_CREATED': {
      if (!notification.aboutComment) return null
      return notification.aboutComment.content
    }
    case 'COMMUNITY_NOTE_ADDED': {
      if (!notification.aboutComment) return null
      return notification.aboutComment.communityNote
    }
    case 'SUGGESTION_MESSAGE': {
      if (!notification.aboutServiceSuggestionMessage) return null
      return notification.aboutServiceSuggestionMessage.content
    }
    case 'EVENT_CREATED': {
      if (!notification.aboutEvent) return null
      return notification.aboutEvent.title
    }
  }
}

export function makeNotificationLink(
  notification: Prisma.NotificationGetPayload<{
    select: {
      type: true
      aboutComment: {
        select: {
          id: true
          service: {
            select: {
              slug: true
            }
          }
        }
      }
      aboutServiceSuggestionId: true
      aboutServiceSuggestionMessage: {
        select: {
          id: true
          suggestion: {
            select: {
              id: true
            }
          }
        }
      }
      aboutEvent: {
        select: {
          service: {
            select: {
              slug: true
            }
          }
        }
      }
      aboutService: {
        select: {
          slug: true
        }
      }
    }
  }>,
  origin: string
): string | null {
  switch (notification.type) {
    case 'COMMENT_STATUS_CHANGE':
    case 'REPLY_COMMENT_CREATED':
    case 'COMMUNITY_NOTE_ADDED':
    case 'ROOT_COMMENT_CREATED': {
      if (!notification.aboutComment) return null
      return makeCommentUrl({
        serviceSlug: notification.aboutComment.service.slug,
        commentId: notification.aboutComment.id,
        origin,
      })
    }
    case 'SUGGESTION_MESSAGE': {
      if (!notification.aboutServiceSuggestionMessage) return null
      return `${origin}/service-suggestion/${String(notification.aboutServiceSuggestionMessage.suggestion.id)}#message-${String(notification.aboutServiceSuggestionMessage.id)}`
    }
    case 'SUGGESTION_STATUS_CHANGE': {
      if (!notification.aboutServiceSuggestionId) return null
      return `${origin}/service-suggestion/${String(notification.aboutServiceSuggestionId)}`
    }
    // TODO: [KARMA_UNLOCK] Will be added later, when karma unloks are in the database, not in the code.
    // case 'KARMA_UNLOCK': {
    //   return `${origin}/account#karma-unlocks`
    // }
    case 'KARMA_CHANGE': {
      return `${origin}/account#karma-transactions`
    }
    case 'ACCOUNT_STATUS_CHANGE': {
      return `${origin}/account#account-status`
    }
    case 'EVENT_CREATED': {
      if (!notification.aboutEvent) return null
      return `${origin}/service/${notification.aboutEvent.service.slug}#events`
    }
    case 'SERVICE_VERIFICATION_STATUS_CHANGE': {
      if (!notification.aboutService) return null
      return `${origin}/service/${notification.aboutService.slug}#verification`
    }
  }
}
