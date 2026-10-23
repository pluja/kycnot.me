import { accountStatusChangesById } from '../constants/accountStatusChange'
import { commentStatusChangesById } from '../constants/commentStatusChange'
import { CLAIM_MAX_FAILED_CHECKS } from '../constants/serviceClaim'
import { serviceVerificationStatusChangesById } from '../constants/serviceStatusChange'
import { getServiceSuggestionTypeInfo } from '../constants/serviceSuggestionType'
import { serviceSuggestionStatusChangesById } from '../constants/suggestionStatusChange'

import { authorDisplayName } from './authorName'
import { makeCommentUrl } from './commentsWithReplies'
import { getEventDisplay } from './eventKind'
import { PROOF_REQUEST_DAYS } from './proofRequests'

import type { NotificationAction } from './serverEventsTypes'
import type { Prisma } from '@prisma/client'

// notificationDisplaySelect is what the notification list and push messages need to title and describe one.
export const notificationDisplaySelect = {
  id: true,
  type: true,
  createdAt: true,
  aboutAccountStatusChange: true,
  aboutCommentStatusChange: true,
  aboutServiceVerificationStatusChange: true,
  aboutSuggestionStatusChange: true,
  aboutComment: {
    select: {
      id: true,
      author: { select: { id: true } },
      status: true,
      content: true,
      publicNote: true,
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
  aboutServiceSuggestionId: true,
  aboutServiceSuggestion: {
    select: {
      status: true,
      type: true,
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
  aboutContactMessage: {
    select: {
      content: true,
      author: { select: { name: true, displayName: true } },
    },
  },
  aboutEvent: {
    select: {
      title: true,
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
} satisfies Prisma.NotificationSelect

// previewText keeps a message notification short: push and chat services show the whole body.
const previewText = (text: string) => {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > 200 ? `${oneLine.slice(0, 199).trimEnd()}…` : oneLine
}

type NotificationDisplay = Prisma.NotificationGetPayload<{ select: typeof notificationDisplaySelect }>

export function makeNotificationTitle(
  notification: NotificationDisplay,
  user: Prisma.UserGetPayload<{ select: { id: true } }> | null
): string {
  switch (notification.type) {
    case 'COMMENT_EDIT_REVIEWED':
      return 'Your edit was reviewed'
    case 'COMMENT_EVIDENCE_CHECKED':
      return 'A moderator checked your evidence'
    case 'COMMENT_PROOF_REQUESTED':
      return 'Proof requested for your comment'
    case 'TEST': {
      return `Test notification #${notification.id.toString()}`
    }
    case 'COMMENT_STATUS_CHANGE': {
      if (!notification.aboutComment) return 'A comment you are watching had a status change'

      if (!notification.aboutCommentStatusChange) {
        return `Comment on ${notification.aboutComment.service.name} had a status change`
      }
      const statusChange = commentStatusChangesById[notification.aboutCommentStatusChange]
      const serviceName = notification.aboutComment.service.name
      const isOwnComment = !!user && notification.aboutComment.author?.id === user.id
      const prefix = isOwnComment ? 'Your comment' : 'Watched comment'

      return `${prefix} on ${serviceName} ${statusChange.notificationTitle}`
    }
    case 'REPLY_COMMENT_CREATED': {
      if (!notification.aboutComment) return 'You have a new reply'
      const serviceName = notification.aboutComment.service.name
      if (!notification.aboutComment.parent) {
        return `New reply to a comment on ${serviceName}`
      }
      const isOwnParentComment = !!user && notification.aboutComment.parent.author?.id === user.id
      return isOwnParentComment
        ? `New reply to your comment on ${serviceName}`
        : `New reply to a watched comment on ${serviceName}`
    }
    case 'COMMUNITY_NOTE_ADDED': {
      if (!notification.aboutComment) return 'A community note was added'
      const serviceName = notification.aboutComment.service.name
      const isOwnComment = !!user && notification.aboutComment.author?.id === user.id
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
    case 'SUGGESTION_CREATED': {
      if (!notification.aboutServiceSuggestion) return 'New service suggestion'
      const typeInfo = getServiceSuggestionTypeInfo(notification.aboutServiceSuggestion.type)
      const service = notification.aboutServiceSuggestion.service.name
      return `New ${typeInfo.labelAlt} suggestion for ${service}`
    }
    case 'SUGGESTION_MESSAGE': {
      if (!notification.aboutServiceSuggestionMessage) return 'New message on your suggestion'
      const service = notification.aboutServiceSuggestionMessage.suggestion.service.name
      return `New message for ${service} suggestion`
    }
    case 'CONTACT_MESSAGE': {
      const isAuthor = !!user && notification.aboutContactThread?.authorId === user.id
      if (isAuthor) return 'Reply from the team'
      const sender = notification.aboutContactMessage?.author
      return sender ? `Contact message from ${authorDisplayName(sender)}` : 'Contact message'
    }
    case 'CONTACT_SEEN': {
      return 'The team has seen your message'
    }
    case 'CONTACT_RESOLVED': {
      return 'Your conversation was resolved'
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
    case 'ACCOUNT_STATUS_CHANGE': {
      if (!notification.aboutAccountStatusChange) return 'Your account status has been updated'
      const accountStatusChange = accountStatusChangesById[notification.aboutAccountStatusChange]
      return accountStatusChange.notificationTitle
    }
    case 'EVENT_CREATED': {
      if (!notification.aboutEvent) return 'New event on a service'
      const service = notification.aboutEvent.service.name
      return `${getEventDisplay(notification.aboutEvent).label} on ${service}`
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
    case 'ACCOUNT_DELETION_WARNING_30_DAYS': {
      return 'Account deletion warning - 30 days remaining'
    }
    case 'ACCOUNT_DELETION_WARNING_15_DAYS': {
      return 'Account deletion warning - 15 days remaining'
    }
    case 'ACCOUNT_DELETION_WARNING_5_DAYS': {
      return 'Account deletion warning - 5 days remaining'
    }
    case 'ACCOUNT_DELETION_WARNING_1_DAY': {
      return 'Account deletion warning - 1 day remaining'
    }
    case 'SERVICE_AFFILIATION_CHECK_FAILED': {
      return notification.aboutService
        ? `Your DNS record for ${notification.aboutService.name} is missing`
        : 'Your affiliation DNS record is missing'
    }
    case 'SERVICE_AFFILIATION_REVOKED': {
      return notification.aboutService
        ? `Your affiliation with ${notification.aboutService.name} was removed`
        : 'Your service affiliation was removed'
    }
    case 'EXPERIENCE_RESOLVED_BY_MODERATORS': {
      return notification.aboutComment
        ? `Your problem with ${notification.aboutComment.service.name} was marked resolved`
        : 'Your problem was marked resolved'
    }
  }
}

export function makeNotificationContent(notification: NotificationDisplay): string | null {
  switch (notification.type) {
    case 'TEST': {
      return `Created on ${notification.createdAt.toLocaleString()}`
    }
    case 'CONTACT_MESSAGE': {
      return notification.aboutContactMessage ? previewText(notification.aboutContactMessage.content) : null
    }
    case 'SUGGESTION_CREATED':
    case 'SUGGESTION_STATUS_CHANGE':
    case 'CONTACT_SEEN':
    case 'CONTACT_RESOLVED':
    case 'ACCOUNT_STATUS_CHANGE':
    case 'SERVICE_VERIFICATION_STATUS_CHANGE': {
      return null
    }
    case 'COMMENT_PROOF_REQUESTED': {
      return `You have ${PROOF_REQUEST_DAYS.toString()} days to add proof. Open your comment to see what was asked.`
    }
    case 'COMMENT_EDIT_REVIEWED':
    case 'COMMENT_EVIDENCE_CHECKED':
    case 'COMMENT_STATUS_CHANGE':
    case 'REPLY_COMMENT_CREATED':
    case 'ROOT_COMMENT_CREATED': {
      if (!notification.aboutComment) return null
      return 'Open the discussion to read this comment.'
    }
    case 'COMMUNITY_NOTE_ADDED': {
      if (!notification.aboutComment) return null
      return notification.aboutComment.publicNote
    }
    case 'SUGGESTION_MESSAGE': {
      if (!notification.aboutServiceSuggestionMessage) return null
      return previewText(notification.aboutServiceSuggestionMessage.content)
    }
    case 'EVENT_CREATED': {
      if (!notification.aboutEvent) return null
      return notification.aboutEvent.title
    }
    case 'ACCOUNT_DELETION_WARNING_30_DAYS':
    case 'ACCOUNT_DELETION_WARNING_15_DAYS':
    case 'ACCOUNT_DELETION_WARNING_5_DAYS':
    case 'ACCOUNT_DELETION_WARNING_1_DAY': {
      return 'Your account will be deleted due to inactivity. Log in and post a comment or create a suggestion to prevent deletion.'
    }
    case 'SERVICE_AFFILIATION_CHECK_FAILED': {
      return `Our daily check could not find your kycnotme-verify TXT record. After ${CLAIM_MAX_FAILED_CHECKS.toString()} misses in a row the affiliation is removed.`
    }
    case 'SERVICE_AFFILIATION_REVOKED': {
      return `The kycnotme-verify TXT record was missing ${CLAIM_MAX_FAILED_CHECKS.toString()} days in a row, or the domain changed owners. Add the record again to claim it back.`
    }
    case 'EXPERIENCE_RESOLVED_BY_MODERATORS': {
      return 'Your review shows the reason. If it isn\'t solved, reply to your review and set "Any problem now?" to "Yes, unresolved".'
    }
  }
}

export function makeNotificationActions(
  notification: NotificationDisplay,
  origin: string
): NotificationAction[] {
  switch (notification.type) {
    case 'TEST': {
      return [
        {
          action: 'view',
          title: 'View',
          ...iconNameAndUrl('ri:arrow-right-line'),
          url: `${origin}/notifications`,
        },
        {
          action: 'profile',
          title: 'Profile',
          ...iconNameAndUrl('ri:user-line'),
          url: `${origin}/account`,
        },
      ]
    }
    case 'COMMENT_EDIT_REVIEWED':
    case 'COMMENT_EVIDENCE_CHECKED':
    case 'COMMENT_PROOF_REQUESTED':
      return notification.aboutComment
        ? [
            {
              action: 'view',
              title: notification.type === 'COMMENT_PROOF_REQUESTED' ? 'Add proof' : 'View decision',
              ...iconNameAndUrl('ri:arrow-right-line'),
              url: makeCommentUrl({
                serviceSlug: notification.aboutComment.service.slug,
                commentId: notification.aboutComment.id,
                origin,
                tool: 'edit',
                section: notification.type === 'COMMENT_EDIT_REVIEWED' ? 'history' : 'proof',
              }),
            },
          ]
        : []
    case 'COMMENT_STATUS_CHANGE':
    case 'REPLY_COMMENT_CREATED':
    case 'COMMUNITY_NOTE_ADDED':
    case 'ROOT_COMMENT_CREATED': {
      if (!notification.aboutComment) return []
      return [
        {
          action: 'view',
          title: 'View',
          ...iconNameAndUrl('ri:arrow-right-line'),
          url: makeCommentUrl({
            serviceSlug: notification.aboutComment.service.slug,
            commentId: notification.aboutComment.id,
            origin,
          }),
        },
      ]
    }
    case 'SUGGESTION_CREATED': {
      if (!notification.aboutServiceSuggestionId) return []
      return [
        {
          action: 'view',
          title: 'View',
          ...iconNameAndUrl('ri:arrow-right-line'),
          url: `${origin}/service-suggestion/${String(notification.aboutServiceSuggestionId)}`,
        },
      ]
    }
    case 'SUGGESTION_MESSAGE': {
      if (!notification.aboutServiceSuggestionMessage) return []
      return [
        {
          action: 'view',
          title: 'View',
          ...iconNameAndUrl('ri:arrow-right-line'),
          url: `${origin}/service-suggestion/${String(notification.aboutServiceSuggestionMessage.suggestion.id)}#message-${String(notification.aboutServiceSuggestionMessage.id)}`,
        },
      ]
    }
    case 'CONTACT_MESSAGE':
    case 'CONTACT_SEEN':
    case 'CONTACT_RESOLVED': {
      if (!notification.aboutContactThreadId) return []
      return [
        {
          action: 'view',
          title: 'View',
          ...iconNameAndUrl('ri:arrow-right-line'),
          // Single URL for both sides: the author sees their thread, while a
          // staff viewer is redirected to the admin queue by /contact/[id].
          url: `${origin}/contact/${String(notification.aboutContactThreadId)}`,
        },
      ]
    }
    case 'SUGGESTION_STATUS_CHANGE': {
      if (!notification.aboutServiceSuggestionId) return []
      return [
        {
          action: 'view',
          title: 'View',
          ...iconNameAndUrl('ri:arrow-right-line'),
          url: `${origin}/service-suggestion/${String(notification.aboutServiceSuggestionId)}`,
        },
      ]
    }
    case 'ACCOUNT_STATUS_CHANGE': {
      return [
        {
          action: 'view',
          title: 'View',
          ...iconNameAndUrl('ri:arrow-right-line'),
          url: `${origin}/account#account-status`,
        },
      ]
    }
    case 'EVENT_CREATED': {
      if (!notification.aboutEvent) return []
      return [
        {
          action: 'view',
          title: 'View',
          ...iconNameAndUrl('ri:arrow-right-line'),
          url: `${origin}/service/${notification.aboutEvent.service.slug}#events`,
        },
      ]
    }
    case 'SERVICE_VERIFICATION_STATUS_CHANGE': {
      if (!notification.aboutService) return []
      return [
        {
          action: 'view',
          title: 'View',
          ...iconNameAndUrl('ri:arrow-right-line'),
          url: `${origin}/service/${notification.aboutService.slug}#verification`,
        },
      ]
    }
    case 'ACCOUNT_DELETION_WARNING_30_DAYS':
    case 'ACCOUNT_DELETION_WARNING_15_DAYS':
    case 'ACCOUNT_DELETION_WARNING_5_DAYS':
    case 'ACCOUNT_DELETION_WARNING_1_DAY': {
      return [
        {
          action: 'login',
          title: 'Login & Stay Active',
          ...iconNameAndUrl('ri:login-box-line'),
          url: `${origin}/login`,
        },
      ]
    }
    case 'SERVICE_AFFILIATION_CHECK_FAILED':
    case 'SERVICE_AFFILIATION_REVOKED': {
      return [
        {
          action: 'view',
          title: 'Check the record',
          ...iconNameAndUrl('ri:arrow-right-line'),
          url: notification.aboutService
            ? `${origin}/account/claim?service=${notification.aboutService.slug}`
            : `${origin}/account`,
        },
      ]
    }
    case 'EXPERIENCE_RESOLVED_BY_MODERATORS': {
      return notification.aboutComment
        ? [
            {
              action: 'view',
              title: 'View comment',
              ...iconNameAndUrl('ri:arrow-right-line'),
              url: makeCommentUrl({
                serviceSlug: notification.aboutComment.service.slug,
                commentId: notification.aboutComment.id,
                origin,
              }),
            },
          ]
        : []
    }
  }
}

function iconUrl<T extends `${string}:${string}`>(iconName: T) {
  return `https://api.iconify.design/${iconName.replace(':', '/') as T extends `${infer Prefix}:${infer Suffix}` ? `${Prefix}/${Suffix}` : never}.svg` as const
}

function iconNameAndUrl<T extends `${string}:${string}`>(iconName: T) {
  return {
    iconName,
    icon: iconUrl(iconName),
  } as const
}
