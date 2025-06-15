/// <reference types="vite/client" />

import type { ActionInput } from '../astroActions'
import type { actions } from 'astro:actions'

type ServerSubscription = {
  endpoint: string
}

export type SafeResult =
  | {
      success: false
      error: string
    }
  | {
      success: true
      error?: undefined
    }

export async function subscribeToPushNotifications(vapidPublicKey: string): Promise<SafeResult> {
  try {
    if (!supportsPushNotifications()) {
      return { success: false, error: 'Push notifications are not supported in this browser' }
    }

    const registration = await getServiceWorkerRegistration()
    if (!registration) return { success: false, error: 'Service worker not available' }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission denied' }
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(vapidPublicKey),
    })

    const p256dh = subscription.getKey('p256dh')
    const auth = subscription.getKey('auth')

    const response = await fetch('/internal-api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dhKey: p256dh ? btoa(String.fromCharCode(...new Uint8Array(p256dh))) : '',
        authKey: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : '',
      } satisfies ActionInput<typeof actions.notification.webPush.subscribe>),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Server error: ${response.statusText} ${errorText}` }
    }

    return { success: true }
  } catch (error) {
    console.error('Push subscription failed:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: `Subscription failed: ${errorMessage}` }
  }
}

export async function unsubscribeFromPushNotifications(): Promise<SafeResult> {
  try {
    const registration = await getServiceWorkerRegistration()
    if (!registration) return { success: false, error: 'Service worker not available' }

    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return { success: false, error: 'No push subscription found' }

    const unsubscribed = await subscription.unsubscribe()
    if (!unsubscribed) return { success: false, error: 'Failed to unsubscribe from browser' }

    const response = await fetch('/internal-api/notifications/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
      } satisfies ActionInput<typeof actions.notification.webPush.unsubscribe>),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Server error: ${response.statusText} ${errorText}` }
    }

    return { success: true }
  } catch (error) {
    console.error('Push unsubscription failed:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: `Unsubscription failed: ${errorMessage}` }
  }
}

export function supportsPushNotifications() {
  const isSecure =
    window.isSecureContext ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'

  return isSecure && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function getServiceWorkerRegistration() {
  try {
    if (window.__SW_REGISTRATION__) return window.__SW_REGISTRATION__
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch (error) {
    console.error('Error getting service worker registration:', error)
    return null
  }
}

async function getCurrentSubscription() {
  try {
    const registration = await getServiceWorkerRegistration()
    if (!registration) return null

    return await registration.pushManager.getSubscription()
  } catch (error) {
    console.error('Error getting current push subscription:', error)
    return null
  }
}

export async function isCurrentDeviceSubscribed(serverSubscriptions: ServerSubscription[]) {
  const currentSubscription = await getCurrentSubscription()
  if (!currentSubscription || serverSubscriptions.length === 0) return false

  return serverSubscriptions.some((sub) => sub.endpoint === currentSubscription.endpoint)
}

function urlB64ToUint8Array(base64String: string) {
  const cleaned = base64String.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (cleaned.length % 4)) % 4)
  const base64 = cleaned + padding

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function parsePushSubscriptions(subscriptionsAsString: string | undefined) {
  try {
    if (typeof subscriptionsAsString !== 'string') {
      console.error('Push subscriptions are not a string')
      return []
    }

    const subscriptions = JSON.parse(subscriptionsAsString)

    if (!Array.isArray(subscriptions)) {
      console.error('Push subscriptions are not an array')
      return []
    }

    if (!subscriptions.every(isServerSubscription)) {
      console.error('Push subscriptions are not valid')
      return subscriptions.filter(isServerSubscription)
    }

    return subscriptions
  } catch (error) {
    console.error('Failed to parse push subscriptions:', error)
    return []
  }
}

function isServerSubscription(subscription: unknown): subscription is ServerSubscription {
  if (typeof subscription !== 'object' || subscription === null) return false
  const s = subscription as Record<string, unknown>
  return typeof s.endpoint === 'string'
}
