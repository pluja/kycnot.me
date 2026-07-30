import rss from '@astrojs/rss'

import { getEventDisplay } from '../../../../lib/eventKind'
import { getEventsForService } from '../../../../lib/feeds'
import { absoluteSiteUrl, siteOrigin } from '../../../../lib/urls'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async (context) => {
  try {
    const origin = siteOrigin

    const result = await getEventsForService(context.params.slug)
    if (!result.success) return new Response(result.error.message, result.error.responseInit)
    const { service, events } = result.data

    return await rss({
      title: `${service.name} - Events & Updates | KYCnot.me`,
      description: `Latest events and updates for ${service.name} tracked on KYCnot.me`,
      site: origin,
      xmlns: { atom: 'http://www.w3.org/2005/Atom' },
      items: events.map((event) => {
        const display = getEventDisplay(event)
        const isOngoing = !event.endedAt || event.endedAt > new Date()
        const statusText = isOngoing ? 'Ongoing' : 'Resolved'

        return {
          title: `${service.name}: ${event.title}`,
          pubDate: event.createdAt,
          description: `${event.content}${event.source ? `\n\nSource: ${event.source}` : ''}`,
          link: `/service/${service.slug}/#event-${String(event.id)}`,
          categories: [display.label, statusText],
        }
      }),
      customData: `<language>en-us</language><atom:link href="${absoluteSiteUrl(context.url.pathname)}" rel="self" type="application/rss+xml"/>`,
    })
  } catch (error) {
    console.error('Error generating service events RSS feed:', error)
    return new Response('Error generating RSS feed', { status: 500 })
  }
}
