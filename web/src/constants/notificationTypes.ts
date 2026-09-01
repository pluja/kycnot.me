import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

import type { Assert } from '../lib/assert'
import type { NotificationType } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

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
      id: 'TEST',
      label: 'Test notification',
      icon: 'ri:flask-line',
    },
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
      id: 'SUGGESTION_CREATED',
      label: 'New suggestion',
      icon: 'ri:lightbulb-line',
    },
    {
      id: 'SUGGESTION_MESSAGE',
      label: 'New message in suggestion',
      icon: 'ri:mail-line',
    },
    {
      id: 'COMMUNITY_NOTE_ADDED',
      label: 'Community note added',
      icon: 'ri:sticky-note-line',
    },
    {
      id: 'CONTACT_MESSAGE',
      label: 'New message in contact thread',
      icon: 'ri:customer-service-2-line',
    },
    {
      id: 'CONTACT_SEEN',
      label: 'Contact thread seen',
      icon: 'ri:eye-line',
    },
    {
      id: 'CONTACT_RESOLVED',
      label: 'Contact thread resolved',
      icon: 'ri:check-double-line',
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
    {
      id: 'ACCOUNT_DELETION_WARNING_30_DAYS',
      label: 'Account deletion warning - 30 days',
      icon: 'ri:alarm-warning-line',
    },
    {
      id: 'ACCOUNT_DELETION_WARNING_15_DAYS',
      label: 'Account deletion warning - 15 days',
      icon: 'ri:alarm-warning-line',
    },
    {
      id: 'ACCOUNT_DELETION_WARNING_5_DAYS',
      label: 'Account deletion warning - 5 days',
      icon: 'ri:alarm-warning-line',
    },
    {
      id: 'ACCOUNT_DELETION_WARNING_1_DAY',
      label: 'Account deletion warning - 1 day',
      icon: 'ri:alarm-warning-line',
    },
  ] as const satisfies NotificationTypeInfo<NotificationType>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof notificationTypes)[number]['id'], NotificationType>>
