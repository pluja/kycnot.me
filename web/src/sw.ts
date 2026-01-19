/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/// <reference types="vite/client" />
/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, setDefaultHandler } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

import {
  makeBrowserNotificationOptions,
  makeBrowserNotificationTitle,
} from './lib/client/notificationOptions'

import type { NotificationData, NotificationPayload } from './lib/serverEventsTypes'
import type { ManifestEntry } from 'workbox-build'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: ManifestEntry[]
}

void self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()

// Keep the manifest placeholder for injectManifest (required by Vite PWA)
// The manifest will be injected here by workbox-build, but we don't use it for caching
const doNothing = (..._ignore: unknown[]) => undefined
doNothing(self.__WB_MANIFEST)

setDefaultHandler(new NetworkFirst())
registerRoute(({ request }) => request.destination === 'document', new NetworkFirst())

self.addEventListener('message', (event) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.error('Push event received but no data')
    return
  }

  const payload = parseNotificationPayload(event.data)
  event.waitUntil(showPushNotification(payload))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data: NotificationData = event.notification.data

  const url =
    data.payload?.actions.find((action) => action.action === event.action)?.url || data.defaultActionUrl

  event.waitUntil(handleNotificationClick(url))
})

async function handleNotificationClick(url: string) {
  const clients = await self.clients.matchAll({ type: 'window' })

  for (const client of clients) {
    if (client.url === url && 'focus' in client) {
      await client.focus()
      return
    }
  }

  await self.clients.openWindow(url)
}

async function showPushNotification(payload: NotificationPayload | null) {
  await self.registration.showNotification(
    makeBrowserNotificationTitle(payload?.title),
    makeBrowserNotificationOptions(payload)
  )
}

function parseNotificationPayload(data: PushMessageData) {
  try {
    const payload = data.json()
    if (isValidNotificationPayload(payload)) return payload

    console.error('Invalid push notification payload:', payload)
    return null
  } catch (error) {
    console.error('Error parsing push notification data:', error)
    return null
  }
}

function isValidNotificationPayload(payload: unknown): payload is NotificationPayload {
  if (typeof payload !== 'object' || payload === null) return false

  const p = payload as Record<string, unknown>

  return (
    typeof p.title === 'string' &&
    (typeof p.body === 'string' || p.body === null) &&
    Array.isArray(p.actions) &&
    p.actions.every((action) => {
      if (typeof action !== 'object' || action === null) return false
      const a = action as Record<string, unknown>
      return typeof a.action === 'string' && typeof a.title === 'string'
    })
  )
}
