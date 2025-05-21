import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

import type { NotificationType } from '@prisma/client'

type NotificationTypeInfo<T extends string | null | undefined = string> = {
  id: T
  label: string
  icon: string
}

export const {
  dataArray: notificationTypes,
  dataObject: notificationTypeLabels,
  getFn: getNotificationTypeInfo,
} = makeHelpersForOptions(
  'id',
  (id): NotificationTypeInfo<typeof id> => ({
    id,
    label: 'Notification',
    icon: 'ri:notification-line',
  }),
  [
    {
      id: 'COMMENT_STATUS_CHANGE',
      label: 'Comment status changed',
      icon: 'ri:chat-check-line',
    },
    {
      id: 'REPLY_COMMENT_CREATED',
      label: 'New reply',
      icon: 'ri:chat-4-line',
    },
    {
      id: 'ROOT_COMMENT_CREATED',
      label: 'New comment/rating',
      icon: 'ri:chat-4-line',
    },
    {
      id: 'SUGGESTION_MESSAGE',
      label: 'New message in suggestion',
      icon: 'ri:mail-line',
    },
    {
      id: 'SUGGESTION_STATUS_CHANGE',
      label: 'Suggestion status changed',
      icon: 'ri:lightbulb-line',
    },
    // TODO: [KARMA_UNLOCK] Will be added later, when karma unloks are in the database, not in the code.
    {
      id: 'KARMA_CHANGE',
      label: 'Karma recieved',
      icon: 'ri:award-line',
    },
    {
      id: 'ACCOUNT_STATUS_CHANGE',
      label: 'Change in account status',
      icon: 'ri:user-settings-line',
    },
    {
      id: 'EVENT_CREATED',
      label: 'New event',
      icon: 'ri:calendar-event-line',
    },
    {
      id: 'SERVICE_VERIFICATION_STATUS_CHANGE',
      label: 'Service verification changed',
      icon: 'ri:verified-badge-line',
    },
  ] as const satisfies NotificationTypeInfo<NotificationType>[]
)
