// @ts-check

/// <reference lib="webworker" />

/** @type {ServiceWorkerGlobalScope} */
// @ts-expect-error
const typedSelf = self

const CACHE_NAME = 'kycnot-sw-push-notifications-v1'

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
    console.log('Push event but no data')
    return
  }

  let notificationData
  try {
    notificationData = event.data.json()
  } catch (error) {
    console.error('Error parsing push data:', error)
    notificationData = {
      title: 'New Notification',
      options: {
        body: event.data.text() || 'You have a new notification',
      },
    }
  }

  const { title, options } = notificationData

  const notificationOptions = {
    body: options.body || '',
    icon: options.icon || '/favicon.svg',
    badge: options.badge || '/favicon.svg',
    data: options.data || {},
    requireInteraction: false,
    silent: false,
    ...options,
  }

  event.waitUntil(typedSelf.registration.showNotification(title, notificationOptions))
})

typedSelf.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event)

  event.notification.close()

  const url = event.notification.data?.url || '/'

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
