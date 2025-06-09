/* eslint-disable import/no-named-as-default-member */
import webpush, { WebPushError } from 'web-push'

import { getServerEnvVariable } from './serverEnvVariables'

import type { NotificationPayload } from './serverEventsTypes'

const VAPID_SUBJECT = getServerEnvVariable('VAPID_SUBJECT')
const VAPID_PUBLIC_KEY = getServerEnvVariable('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = getServerEnvVariable('VAPID_PRIVATE_KEY')

// Configure VAPID keys
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

export { webpush }

export async function sendPushNotification(
  subscription: {
    endpoint: string
    keys: {
      p256dh: string
      auth: string
    }
  },
  payload: NotificationPayload
) {
  try {
    // NOTE: View sw.js to see how the notification is handled
    const result = await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 24 * 60 * 60, // 24 hours
    })
    return { success: true, result } as const
  } catch (error) {
    console.error('Error sending push notification:', error)
    return {
      success: false,
      error: error instanceof WebPushError ? error : undefined,
    } as const
  }
}
