/* eslint-disable import/no-named-as-default-member */
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from 'astro:env/server'
import webpush, { WebPushError } from 'web-push'

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
  data: {
    title: string
    body?: string
    icon?: string
    badge?: string
    url?: string
  }
) {
  try {
    const result = await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: data.title,
        options: {
          body: data.body,
          icon: data.icon ?? '/favicon.svg',
          badge: data.badge ?? '/favicon.svg',
          data: {
            url: data.url,
          },
        },
      }),
      {
        TTL: 24 * 60 * 60, // 24 hours
      }
    )
    return { success: true, result } as const
  } catch (error) {
    console.error('Error sending push notification:', error)
    return {
      success: false,
      error: error instanceof WebPushError ? error : undefined,
    } as const
  }
}
