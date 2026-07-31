import rss from '@astrojs/rss'

import { getIncidentSeverityInfo } from '../../constants/incidentSeverities'
import { getEventDisplay, eventStatusLabel } from '../../lib/eventKind'
import { getEvents, isEventFeedView, type EventFeedView } from '../../lib/feeds'
import { absoluteSiteUrl, siteOrigin } from '../../lib/urls'

import type { APIRoute } from 'astro'

const viewMeta: Record<EventFeedView, { title: string; description: string }> = {
  curated: {
    title: 'KYCnot.me - Service Events',
    description: 'Latest events and incidents from privacy-focused services tracked on KYCnot.me',
  },
  incidents: {
    title: 'KYCnot.me - Security Incidents',
    description:
      'Security incidents (exploits, hacks, breaches, frozen funds) affecting services tracked on KYCnot.me',
  },
  alerts: {
    title: 'KYCnot.me - Alerts & Incidents',
    description: 'Warnings, alerts and security incidents for services tracked on KYCnot.me',
  },
  all: {
    title: 'KYCnot.me - All Service Events',
    description: 'All events, including auto-recorded service changes, from services tracked on KYCnot.me',
  },
}

export const GET: APIRoute = async (context) => {
  try {
    const origin = siteOrigin

    const requested = context.url.searchParams.get('view')
    const view: EventFeedView = isEventFeedView(requested) ? requested : 'curated'

    const result = await getEvents(view)
    if (!result.success) return new Response(result.error.message, result.error.responseInit)
    const { events } = result.data

    const meta = viewMeta[view]
    // Reflect only the validated view in the self link (never the raw query).
    const selfPath = view === 'curated' ? context.url.pathname : `${context.url.pathname}?view=${view}`

    return await rss({
      title: meta.title,
      description: meta.description,
      site: origin,
      xmlns: { atom: 'http://www.w3.org/2005/Atom' },
      items: events.map((event) => {
        const display = getEventDisplay(event)
        const statusText = eventStatusLabel(event)

        const categories = [display.label, event.service.name, statusText]
        let description = event.content
        if (event.incident) {
          const severity = getIncidentSeverityInfo(event.incident.severity)
          categories.unshift('Incident', severity.label)
          description = `[Security incident · ${severity.label} · ${statusText}]\n\n${description}`
        }
        if (event.source) description += `\n\nSource: ${event.source}`

        return {
          title: `${event.service.name}: ${event.title}`,
          pubDate: event.createdAt,
          description,
          link: `/service/${event.service.slug}/#event-${String(event.id)}`,
          categories,
        }
      }),
      customData: `<language>en-us</language><atom:link href="${absoluteSiteUrl(selfPath)}" rel="self" type="application/rss+xml"/>`,
    })
  } catch (error) {
    console.error('Error generating events RSS feed:', error)
    return new Response('Error generating RSS feed', { status: 500 })
  }
}
