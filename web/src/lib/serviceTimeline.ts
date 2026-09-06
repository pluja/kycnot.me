import { orderBy } from 'lodash-es'

import { eventToDisplayKind, isEventOpen } from './eventKind'
import { computeIncidentTrustPenalty } from './incidentPenalty'

import type { DisplayableEvent } from './eventKind'
import type { IncidentTrustPenalty } from './incidentPenalty'
import type { Incident } from '@prisma/client'

/** Days after which an event with no trust weight moves under "older". */
export const RECENT_WINDOW_DAYS = 365

type TimelineIncident = Pick<
  Incident,
  'occurredAt' | 'outcome' | 'resolvedAt' | 'severity' | 'state' | 'trustOverride'
>

export type TimelineEvent = DisplayableEvent & {
  id: number
  incident: TimelineIncident | null
}

export type TimelineTier = 'older' | 'ongoing' | 'recent'

export type TimelineEntry<E extends TimelineEvent> = {
  event: E
  tier: TimelineTier
  /** Null for entries that are not incidents. */
  penalty: IncidentTrustPenalty | null
  /** When the entry last moved: resolution, end, or now while it runs. */
  lastActivity: Date
  /** A resolved incident, or a closed warning: over, whatever it still weighs. */
  isResolved: boolean
}

export type TieredTimeline<E extends TimelineEvent> = {
  ongoing: TimelineEntry<E>[]
  recent: TimelineEntry<E>[]
  older: TimelineEntry<E>[]
  /** Listing edits, kept apart because they are many and say little. */
  changes: E[]
}

function lastActivityOf(event: TimelineEvent, now: Date): Date {
  if (event.incident) return event.incident.resolvedAt ?? now
  return event.endedAt ?? now
}

function isResolvedEntry(event: TimelineEvent, now: Date): boolean {
  if (event.incident) return event.incident.state === 'RESOLVED'
  const kind = eventToDisplayKind(event)
  return (kind === 'WARNING' || kind === 'ALERT') && !isEventOpen(event, now)
}

function tierOf(
  event: TimelineEvent,
  penalty: IncidentTrustPenalty | null,
  lastActivity: Date,
  now: Date
): TimelineTier {
  if (event.incident) {
    if (event.incident.state === 'ONGOING') return 'ongoing'
    return penalty && penalty.points < 0 ? 'recent' : 'older'
  }
  const kind = eventToDisplayKind(event)
  const closes = kind === 'WARNING' || kind === 'ALERT'
  if (closes && isEventOpen(event, now)) return 'ongoing'
  const ageDays = (now.getTime() - lastActivity.getTime()) / 86_400_000
  return ageDays <= RECENT_WINDOW_DAYS ? 'recent' : 'older'
}

/**
 * Splits a service's events into what needs attention now, what still matters,
 * and what is history. An incident stays "recent" for as long as it costs
 * trust; a plain event for a year after it ended. Each tier is newest first.
 */
export function tierTimeline<E extends TimelineEvent>(events: E[], now = new Date()): TieredTimeline<E> {
  const changes = events.filter((event) => event.class === 'CHANGE')
  const entries = events
    .filter((event) => event.class !== 'CHANGE')
    .map((event): TimelineEntry<E> => {
      const penalty = event.incident ? computeIncidentTrustPenalty(event.incident, now) : null
      const lastActivity = lastActivityOf(event, now)
      return {
        event,
        penalty,
        lastActivity,
        tier: tierOf(event, penalty, lastActivity, now),
        isResolved: isResolvedEntry(event, now),
      }
    })
  const sorted = orderBy(entries, ['lastActivity', 'event.startedAt'], ['desc', 'desc'])
  return {
    ongoing: sorted.filter((entry) => entry.tier === 'ongoing'),
    recent: sorted.filter((entry) => entry.tier === 'recent'),
    older: sorted.filter((entry) => entry.tier === 'older'),
    changes,
  }
}

/** How many entries a section shows unfolded before older ones go behind a fold. */
export const MIN_VISIBLE_ENTRIES = 3

/**
 * Splits a section's older entries into the ones shown unfolded so the list
 * is never nearly empty, and the ones kept behind the fold. A service with a
 * single old event still shows it.
 */
export function splitOlder<T>(visibleCount: number, older: T[]): { shown: T[]; folded: T[] } {
  const room = Math.max(0, MIN_VISIBLE_ENTRIES - visibleCount)
  return { shown: older.slice(0, room), folded: older.slice(room) }
}
