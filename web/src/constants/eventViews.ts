import { z } from 'astro/zod'

import type { Prisma } from '@prisma/client'

/// The timeline defaults to curated entries. Listing edits are the highest
/// volume rows by far, so they stay out until asked for by name.
export const eventViews = [
  { value: 'curated', label: 'Events & incidents' },
  { value: 'incidents', label: 'Incidents' },
  { value: 'changes', label: 'Listing edits' },
  { value: 'all', label: 'Everything' },
] as const satisfies { value: string; label: string }[]

export type EventView = (typeof eventViews)[number]['value']

export const eventViewsZodEnum = z.enum(eventViews.map((view) => view.value) as [EventView, ...EventView[]])

export function eventClassFilterFor(view: EventView): Prisma.EventWhereInput['class'] {
  switch (view) {
    case 'incidents':
      return 'INCIDENT'
    case 'changes':
      return 'CHANGE'
    case 'all':
      return undefined
    case 'curated':
      return { in: ['EVENT', 'INCIDENT'] }
  }
}
