import { DEPLOYMENT_MODE } from './envVariables'

import type { NotificationData, NotificationPayload } from '../serverEventsTypes'

export type CustomNotificationOptions = NotificationOptions & {
  actions?: { action: string; title: string; icon?: string }[]
  timestamp: number
  data: NotificationData
}

export function makeBrowserNotificationTitle(title?: string | null) {
  const prefix = DEPLOYMENT_MODE === 'development' ? '[DEV] ' : DEPLOYMENT_MODE === 'staging' ? '[PRE] ' : ''
  return `${prefix}${title ?? 'New Notification'}`
}

export function makeBrowserNotificationOptions(
  payload: NotificationPayload | null,
  options: { removeActions?: boolean } = {}
) {
  const defaultOptions: CustomNotificationOptions = {
    body: 'You have a new notification',
    lang: 'en-US',
    icon:
      DEPLOYMENT_MODE === 'development'
        ? '/favicon-dev.svg'
        : DEPLOYMENT_MODE === 'staging'
          ? '/favicon-stage.svg'
          : '/favicon.svg',
    badge: '/notification-icon.svg',
    requireInteraction: false,
    silent: false,
    actions: options.removeActions
      ? undefined
      : [
          {
            action: 'view',
            title: 'View',
            icon: 'https://api.iconify.design/ri/arrow-right-line.svg',
          },
        ],
    timestamp: Date.now(),
    data: {
      defaultActionUrl: '/notifications',
      payload: null,
    },
  }

  if (!payload) {
    return defaultOptions
  }

  return {
    ...defaultOptions,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    body: payload.body || undefined,
    actions: options.removeActions
      ? undefined
      : payload.actions.map((action) => ({
          action: action.action,
          title: action.title,
          icon: action.icon,
        })),
    data: {
      ...defaultOptions.data,
      payload,
    },
  } as CustomNotificationOptions
}
