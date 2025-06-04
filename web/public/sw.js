// @ts-check

/// <reference lib="webworker" />

/** @type {ServiceWorkerGlobalScope} */
// @ts-expect-error
const typedSelf = self

const CACHE_NAME = 'kycnot-sw-push-notifications-v2'

/** @typedef {import('../src/lib/webPush').NotificationPayload} NotificationPayload */
/** @typedef {{defaultActionUrl: string, payload: NotificationPayload | null}} NotificationData */
/** @typedef {NotificationOptions & { actions: { action: string; title: string; icon?: string }[], timestamp: number, data: NotificationData }  } CustomNotificationOptions */

typedSelf.addEventListener('install', (event) => {
  console.log('Service Worker installing')
  typedSelf.skipWaiting()
})

typedSelf.addEventListener('activate', (event) => {
  console.log('Service Worker activating')
  event.waitUntil(typedSelf.clients.claim())
})

typedSelf.addEventListener('push', (event) => {
  console.log('Push event received:', event)

  if (!event.data) {
    console.error('Push event but no data')
    return
  }

  let title = 'New Notification'
  /** @type {CustomNotificationOptions} */
  let options = {
    body: 'You have a new notification',
    lang: 'en-US',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    requireInteraction: false,
    silent: false,
    actions: [
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

  try {
    /** @type {NotificationPayload} */
    const rawData = event.data.json()
    if (typeof rawData !== 'object' || rawData === null) throw new Error('Invalid push data, not an object')
    if (!('title' in rawData) || typeof rawData.title !== 'string')
      throw new Error('Invalid push data, no title')
    title = rawData.title

    options = {
      ...options,
      body: rawData.body || undefined,
      actions: rawData.actions.map((action) => ({
        action: action.action,
        title: action.title,
        icon: action.icon,
      })),
      data: {
        ...options.data,
        payload: rawData,
      },
    }
  } catch (error) {
    console.error('Error parsing push data:', error)
  }

  event.waitUntil(typedSelf.registration.showNotification(title, options))
})

typedSelf.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event)

  event.notification.close()

  /** @type {NotificationData} */
  const data = event.notification.data

  // @ts-expect-error I already use optional chaining
  const url = data.payload?.[event.action]?.url || data.defaultActionUrl

  event.waitUntil(
    typedSelf.clients.matchAll({ type: 'window' }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }

      // Otherwise, open a new window
      if (typedSelf.clients.openWindow) {
        return typedSelf.clients.openWindow(url)
      }
    })
  )
})

typedSelf.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event)
})
