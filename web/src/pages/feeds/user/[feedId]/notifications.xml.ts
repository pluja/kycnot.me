import rss from '@astrojs/rss'
import { SITE_URL } from 'astro:env/client'

import { getNotificationTypeInfo } from '../../../../constants/notificationTypes'
import { getUserNotifications } from '../../../../lib/feeds'
import {
  makeNotificationActions,
  makeNotificationContent,
  makeNotificationTitle,
} from '../../../../lib/notifications'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async (context) => {
  try {
    const origin = context.site?.origin ?? new URL(SITE_URL).origin
    const feedId = context.params.feedId

    const result = await getUserNotifications(feedId)
    if (!result.success) return new Response(result.error.message, result.error.responseInit)
    const { user, notifications } = result.data

    const displayName = user.displayName ?? user.name

    return await rss({
      title: `${displayName}'s Notifications - KYCnot.me`,
      description: `Notifications for ${displayName} on KYCnot.me - Privacy-focused service reviews and updates`,
      site: origin,
      xmlns: { atom: 'http://www.w3.org/2005/Atom' },
      items: notifications.map((notification) => {
        const typeInfo = getNotificationTypeInfo(notification.type)

        const title = makeNotificationTitle(notification, user)
        const description = makeNotificationContent(notification) ?? typeInfo.label
        const actions = makeNotificationActions(notification, origin)
        const link = actions[0]?.url ?? `${origin}/notifications`

        return {
          title,
          pubDate: notification.createdAt,
          description,
          link,
          categories: [typeInfo.label],
        }
      }),
      customData: `<language>en-us</language><atom:link href="${context.url.href}" rel="self" type="application/rss+xml"/>`,
    })
  } catch (error) {
    console.error('Error generating user notifications RSS feed:', error)
    return new Response('Error generating RSS feed', { status: 500 })
  }
}
