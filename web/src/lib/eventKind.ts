import { getEventKindInfo, resolvedEventClassNames } from '../constants/eventKinds'

import type { EventDisplayKind } from '../constants/eventKinds'
import type { EventClass, EventSentiment, EventType, IncidentState } from '@prisma/client'

// A single moderator-facing choice that maps to the underlying class + sentiment
// + legacy type, so the admin form has one "Kind" dropdown instead of three.
export const EVENT_KINDS = ['INFO', 'UPDATE', 'WARNING', 'INCIDENT'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

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

export type DisplayableEvent = {
  class: EventClass
  sentiment: EventSentiment
  startedAt: Date
  endedAt: Date | null
  /// Only read to keep untriaged legacy rows at their original severity and
  /// solved state. Safe to omit once no row relies on the legacy bridges.
  type?: EventType
  incident?: { state: IncidentState } | null
}

// Legacy severities that predate the class + sentiment taxonomy. Rows still
// carrying them were never triaged into an Incident, and dropping to the plain
// WARNING tier would quietly downgrade live red flags, so they keep the ALERT
// tier until a moderator files or clears them.
const LEGACY_SEVERE_TYPES: EventType[] = ['ALERT', 'ALERT_SOLVED']

// The same era encoded "already dealt with" in the type. Those rows predate the
// convention that a later endedAt closes an entry, so several carry a
// point-in-time endedAt and would otherwise read as still active.
const LEGACY_RESOLVED_TYPES: EventType[] = ['ALERT_SOLVED', 'WARNING_SOLVED']

// eventToDisplayKind collapses the stored taxonomy into one of the shapes the UI draws.
export function eventToDisplayKind(
  event: Pick<DisplayableEvent, 'class' | 'sentiment' | 'type'>
): EventDisplayKind {
  if (event.class === 'CHANGE') return 'CHANGE'
  const kind = eventToKind(event.class, event.sentiment)
  if (kind === 'WARNING' && event.type && LEGACY_SEVERE_TYPES.includes(event.type)) return 'ALERT'
  return kind
}

// An attached Incident carries the authoritative state and wins. Otherwise an
// endedAt equal to startedAt marks a point-in-time entry rather than a
// resolution, and one in the future means the entry has not closed yet, which is
// how every query on the site decides whether an event is still running.
function isEventResolved(event: DisplayableEvent, now: Date): boolean {
  if (event.incident) return event.incident.state === 'RESOLVED'
  if (event.type && LEGACY_RESOLVED_TYPES.includes(event.type)) return true
  if (!event.endedAt) return false
  return event.endedAt.getTime() > event.startedAt.getTime() && event.endedAt.getTime() <= now.getTime()
}

export type EventDisplay = ReturnType<typeof getEventDisplay>

// getEventDisplay resolves an event to its looks. A resolved entry overrides the
// kind's label, color and classes, and never asks for a banner.
export function getEventDisplay(event: DisplayableEvent, now = new Date()) {
  const kind = eventToDisplayKind(event)
  const info = getEventKindInfo(kind)
  const closes = kind === 'WARNING' || kind === 'ALERT' || kind === 'INCIDENT'

  if (!closes || !isEventResolved(event, now)) {
    return { ...info, kind, isResolved: false }
  }

  return {
    ...info,
    kind,
    isResolved: true,
    label: `${info.label} resolved`,
    color: 'green' as const,
    showBanner: false,
    classNames: resolvedEventClassNames,
  }
}

// pickPrimaryEvent picks the entry that represents a whole list in one badge:
// the most severe unresolved one, falling back to the most severe overall.
export function pickPrimaryEvent<T extends DisplayableEvent>(
  events: readonly T[],
  now = new Date()
): T | null {
  let best: { event: T; rank: number } | null = null
  for (const event of events) {
    const display = getEventDisplay(event, now)
    const rank = display.weight + (display.isResolved ? 0 : 100)
    if (!best || rank > best.rank) best = { event, rank }
  }
  return best?.event ?? null
}
