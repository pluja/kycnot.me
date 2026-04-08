import rss from '@astrojs/rss'

import { getEventTypeInfo } from '../../constants/eventTypes'
import { getEvents } from '../../lib/feeds'
import { absoluteSiteUrl, siteOrigin } from '../../lib/urls'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async (context) => {
  try {
    const origin = siteOrigin

    const result = await getEvents()
    if (!result.success) return new Response(result.error.message, result.error.responseInit)
    const { events } = result.data

    return await rss({
      title: 'KYCnot.me - Service Events',
      description: 'Latest events and updates from privacy-focused services tracked on KYCnot.me',
      site: origin,
      xmlns: { atom: 'http://www.w3.org/2005/Atom' },
      items: events.map((event) => {
        const eventTypeInfo = getEventTypeInfo(event.type)
        const isOngoing = !event.endedAt || event.endedAt > new Date()
        const statusText = isOngoing ? 'Ongoing' : 'Resolved'

        return {
          title: `${event.service.name}: ${event.title}`,
          pubDate: event.createdAt,
          description: `${event.content}${event.source ? `\n\nSource: ${event.source}` : ''}`,
          link: `/service/${event.service.slug}/#event-${String(event.id)}`,
          categories: [eventTypeInfo.label, event.service.name, statusText],
        }
      }),
      customData: `<language>en-us</language><atom:link href="${absoluteSiteUrl(context.url.pathname)}" rel="self" type="application/rss+xml"/>`,
    })
  } catch (error) {
    console.error('Error generating events RSS feed:', error)
    return new Response('Error generating RSS feed', { status: 500 })
  }
}
