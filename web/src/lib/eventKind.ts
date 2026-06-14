import type { EventClass, EventSentiment, EventType } from '@prisma/client'

// A single moderator-facing choice that maps to the underlying class + sentiment
// + legacy type, so the admin form has one "Kind" dropdown instead of three.
export const EVENT_KINDS = ['INFO', 'UPDATE', 'WARNING', 'INCIDENT'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const eventKindOptions: { value: EventKind; label: string }[] = [
  { value: 'INFO', label: 'Information' },
  { value: 'UPDATE', label: 'Update / good news' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'INCIDENT', label: 'Security incident' },
]

export function eventKindToFields(kind: EventKind): {
  class: EventClass
  sentiment: EventSentiment
  type: EventType
} {
  switch (kind) {
    case 'INCIDENT':
      return { class: 'INCIDENT', sentiment: 'NEGATIVE', type: 'ALERT' }
    case 'WARNING':
      return { class: 'EVENT', sentiment: 'NEGATIVE', type: 'WARNING' }
    case 'UPDATE':
      return { class: 'EVENT', sentiment: 'POSITIVE', type: 'NORMAL' }
    case 'INFO':
      return { class: 'EVENT', sentiment: 'NEUTRAL', type: 'INFO' }
  }
}

export function eventToKind(eventClass: EventClass, sentiment: EventSentiment): EventKind {
  if (eventClass === 'INCIDENT') return 'INCIDENT'
  if (sentiment === 'NEGATIVE') return 'WARNING'
  if (sentiment === 'POSITIVE') return 'UPDATE'
  return 'INFO'
}
