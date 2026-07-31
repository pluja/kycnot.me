import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EVENT_DISPLAY_KINDS } from '../constants/eventKinds'

import {
  eventKindToFields,
  eventToDisplayKind,
  getEventDisplay,
  isEventOpen,
  pickPrimaryEvent,
} from './eventKind'

import type { DisplayableEvent, EventKind } from './eventKind'
import type { EventDisplayKind } from '../constants/eventKinds'
import type { EventSentiment, EventType, IncidentState } from '@prisma/client'

const DAY = 24 * 60 * 60 * 1000
const start = new Date('2026-01-01T00:00:00Z')
const later = new Date(start.getTime() + 3 * DAY)
const now = new Date(start.getTime() + 30 * DAY)

function event(overrides: Partial<DisplayableEvent> = {}): DisplayableEvent {
  return { class: 'EVENT', sentiment: 'NEUTRAL', startedAt: start, endedAt: null, ...overrides }
}

// One sample per display kind, so a new kind fails to compile until covered.
const sampleByKind: Record<EventDisplayKind, Partial<DisplayableEvent>> = {
  CHANGE: { class: 'CHANGE' },
  INFO: {},
  UPDATE: { sentiment: 'POSITIVE' },
  WARNING: { sentiment: 'NEGATIVE' },
  ALERT: { sentiment: 'NEGATIVE', type: 'ALERT' },
  INCIDENT: { class: 'INCIDENT', sentiment: 'NEGATIVE' },
}

void test('every authorable kind round-trips through the display taxonomy', () => {
  const expected: Record<EventKind, EventDisplayKind> = {
    INFO: 'INFO',
    UPDATE: 'UPDATE',
    WARNING: 'WARNING',
    INCIDENT: 'INCIDENT',
  }
  for (const [kind, displayKind] of Object.entries(expected) as [EventKind, EventDisplayKind][]) {
    assert.equal(eventToDisplayKind(eventKindToFields(kind)), displayKind, kind)
  }
})

void test('CHANGE class wins over sentiment', () => {
  const sentiments: EventSentiment[] = ['POSITIVE', 'NEUTRAL', 'NEGATIVE']
  for (const sentiment of sentiments) {
    assert.equal(eventToDisplayKind({ class: 'CHANGE', sentiment }), 'CHANGE')
  }
})

void test('untriaged legacy alerts keep the severe tier instead of dropping to WARNING', () => {
  const severe: EventType[] = ['ALERT', 'ALERT_SOLVED']
  for (const type of severe) {
    assert.equal(eventToDisplayKind({ class: 'EVENT', sentiment: 'NEGATIVE', type }), 'ALERT')
  }
  // A legacy warning is not promoted, and a legacy type never overrides a
  // non-negative sentiment.
  assert.equal(eventToDisplayKind({ class: 'EVENT', sentiment: 'NEGATIVE', type: 'WARNING' }), 'WARNING')
  assert.equal(eventToDisplayKind({ class: 'EVENT', sentiment: 'NEUTRAL', type: 'ALERT' }), 'INFO')
})

void test('every display kind resolves to real metadata', () => {
  for (const kind of EVENT_DISPLAY_KINDS) {
    const display = getEventDisplay(event(sampleByKind[kind]), now)
    assert.equal(display.kind, kind)
    assert.notEqual(display.icon, 'ri:question-fill', `${kind} fell through to the fallback`)
    assert.ok(display.label.length > 0)
    assert.ok(display.description.length > 0, `${kind} has no description to explain itself`)
  }
})

void test('a point-in-time entry is not treated as resolved', () => {
  const oneTime = getEventDisplay(event({ sentiment: 'NEGATIVE', endedAt: start }), now)
  assert.equal(oneTime.isResolved, false)
  assert.equal(oneTime.showBanner, true)

  const closed = getEventDisplay(event({ sentiment: 'NEGATIVE', endedAt: later }), now)
  assert.equal(closed.isResolved, true)
  assert.equal(closed.showBanner, false)
  assert.equal(closed.color, 'green')
  assert.match(closed.label, /resolved$/)
})

void test('an end date still in the future leaves the entry open', () => {
  const future = new Date(now.getTime() + 7 * DAY)
  const display = getEventDisplay(event({ sentiment: 'NEGATIVE', endedAt: future }), now)
  assert.equal(display.isResolved, false)
  // The banner has to keep showing, which is the whole point of not calling a
  // scheduled end date a resolution.
  assert.equal(display.showBanner, true)
})

void test('legacy solved types read as resolved despite a point-in-time end date', () => {
  const solved: EventType[] = ['WARNING_SOLVED', 'ALERT_SOLVED']
  for (const type of solved) {
    const display = getEventDisplay(event({ sentiment: 'NEGATIVE', endedAt: start, type }), now)
    assert.equal(display.isResolved, true, type)
    assert.equal(display.showBanner, false, type)
  }
})

void test('an attached incident state overrides the end date', () => {
  const states: { state: IncidentState; resolved: boolean }[] = [
    { state: 'ONGOING', resolved: false },
    { state: 'RESOLVED', resolved: true },
  ]
  for (const { state, resolved } of states) {
    // endedAt deliberately disagrees with the incident state in both directions.
    const endedAt = state === 'ONGOING' ? later : null
    const display = getEventDisplay(
      event({ class: 'INCIDENT', sentiment: 'NEGATIVE', endedAt, incident: { state } }),
      now
    )
    assert.equal(display.isResolved, resolved, state)
  }
})

void test('neutral and positive entries never render as resolved', () => {
  for (const sentiment of ['NEUTRAL', 'POSITIVE'] satisfies EventSentiment[]) {
    const display = getEventDisplay(event({ sentiment, endedAt: later }), now)
    assert.equal(display.isResolved, false, sentiment)
  }
})

void test('pickPrimaryEvent prefers an unresolved entry over a more severe resolved one', () => {
  const resolvedIncident = event({
    class: 'INCIDENT',
    sentiment: 'NEGATIVE',
    endedAt: later,
    incident: { state: 'RESOLVED' },
  })
  const openWarning = event({ sentiment: 'NEGATIVE' })

  assert.equal(pickPrimaryEvent([resolvedIncident, openWarning], now), openWarning)
  assert.equal(pickPrimaryEvent([openWarning, resolvedIncident], now), openWarning)
})

void test('pickPrimaryEvent ranks by severity among unresolved entries', () => {
  const info = event()
  const warning = event({ sentiment: 'NEGATIVE' })
  const incident = event({ class: 'INCIDENT', sentiment: 'NEGATIVE', incident: { state: 'ONGOING' } })

  assert.equal(pickPrimaryEvent([info, warning, incident], now), incident)
  assert.equal(pickPrimaryEvent([incident, warning, info], now), incident)
  assert.equal(pickPrimaryEvent([info, warning], now), warning)
})

void test('pickPrimaryEvent returns null for an empty list', () => {
  assert.equal(pickPrimaryEvent([]), null)
})

void test('every kind stops being open once its end date passes', () => {
  // Regression: grouping once derived "ongoing" from isResolved, which is
  // permanently false for the kinds that never resolve, so listing edits and
  // announcements stayed under "Ongoing" forever.
  const ended = { endedAt: later }
  for (const kind of EVENT_DISPLAY_KINDS) {
    assert.equal(isEventOpen(event({ ...sampleByKind[kind], ...ended }), now), false, kind)
  }
})

void test('an entry with no end date, or one still ahead, is open', () => {
  assert.equal(isEventOpen(event({ class: 'CHANGE', endedAt: null }), now), true)
  assert.equal(isEventOpen(event({ sentiment: 'NEGATIVE', endedAt: null }), now), true)
  assert.equal(
    isEventOpen(event({ sentiment: 'NEGATIVE', endedAt: new Date(now.getTime() + DAY) }), now),
    true
  )
})

void test('incident state decides openness regardless of the end date', () => {
  const resolvedNoEnd = event({
    class: 'INCIDENT',
    sentiment: 'NEGATIVE',
    endedAt: null,
    incident: { state: 'RESOLVED' },
  })
  assert.equal(isEventOpen(resolvedNoEnd, now), false)

  const ongoingPastEnd = event({
    class: 'INCIDENT',
    sentiment: 'NEGATIVE',
    endedAt: later,
    incident: { state: 'ONGOING' },
  })
  assert.equal(isEventOpen(ongoingPastEnd, now), true)
})

void test('legacy solved entries are closed even without a later end date', () => {
  for (const type of ['WARNING_SOLVED', 'ALERT_SOLVED'] satisfies EventType[]) {
    assert.equal(isEventOpen(event({ sentiment: 'NEGATIVE', endedAt: start, type }), now), false, type)
  }
})
