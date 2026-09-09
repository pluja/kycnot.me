import assert from 'node:assert/strict'
import { test } from 'node:test'

import { splitOlder, tierTimeline } from './serviceTimeline'

import type { TimelineEvent } from './serviceTimeline'

const now = new Date('2026-09-05T12:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000)

let nextId = 1
function event(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: nextId++,
    class: 'EVENT',
    sentiment: 'NEUTRAL',
    startedAt: daysAgo(10),
    endedAt: daysAgo(10),
    incident: null,
    ...overrides,
  }
}

type IncidentFields = NonNullable<TimelineEvent['incident']>

function incident(fields: Partial<IncidentFields>, overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return event({
    class: 'INCIDENT',
    sentiment: 'NEGATIVE',
    ...overrides,
    incident: {
      severity: 'HIGH',
      state: 'RESOLVED',
      occurredAt: daysAgo(30),
      resolvedAt: daysAgo(20),
      outcome: null,
      trustOverride: null,
      ...fields,
    },
  })
}

void test('an open incident is ongoing, a resolved one that still costs trust is recent', () => {
  const open = incident({ state: 'ONGOING', resolvedAt: null })
  const resolved = incident({ state: 'RESOLVED', resolvedAt: daysAgo(20) })
  const tiers = tierTimeline([resolved, open], now)
  assert.deepEqual(
    tiers.ongoing.map((entry) => entry.event.id),
    [open.id]
  )
  assert.deepEqual(
    tiers.recent.map((entry) => entry.event.id),
    [resolved.id]
  )
  assert.ok(tiers.recent[0]?.penalty && tiers.recent[0].penalty.points < 0)
  assert.equal(tiers.ongoing[0]?.isResolved, false)
  assert.equal(tiers.recent[0].isResolved, true)
})

void test('an incident whose penalty has faded is older, however recent the date', () => {
  const faded = incident({ severity: 'LOW', resolvedAt: daysAgo(200), occurredAt: daysAgo(210) })
  const tiers = tierTimeline([faded], now)
  assert.equal(tiers.older.length, 1)
  assert.ok(tiers.older[0]?.penalty?.points === 0)
})

void test('plain events split on a one year window from when they ended', () => {
  const fresh = event({ startedAt: daysAgo(100), endedAt: daysAgo(100) })
  const stale = event({ startedAt: daysAgo(400), endedAt: daysAgo(400) })
  const tiers = tierTimeline([stale, fresh], now)
  assert.deepEqual(
    tiers.recent.map((entry) => entry.event.id),
    [fresh.id]
  )
  assert.deepEqual(
    tiers.older.map((entry) => entry.event.id),
    [stale.id]
  )
})

void test('an open warning is ongoing, an open note is not', () => {
  const warning = event({ sentiment: 'NEGATIVE', startedAt: daysAgo(3), endedAt: null })
  const note = event({ sentiment: 'NEUTRAL', startedAt: daysAgo(3), endedAt: null })
  const tiers = tierTimeline([warning, note], now)
  assert.deepEqual(
    tiers.ongoing.map((entry) => entry.event.id),
    [warning.id]
  )
  assert.deepEqual(
    tiers.recent.map((entry) => entry.event.id),
    [note.id]
  )
  assert.equal(tiers.recent[0]?.isResolved, false)
})

void test('tiers are newest activity first and listing edits are kept apart', () => {
  const older = event({ startedAt: daysAgo(50), endedAt: daysAgo(50) })
  const newer = event({ startedAt: daysAgo(5), endedAt: daysAgo(5) })
  const edit = event({ class: 'CHANGE', startedAt: daysAgo(1), endedAt: daysAgo(1) })
  const tiers = tierTimeline([older, edit, newer], now)
  assert.deepEqual(
    tiers.recent.map((entry) => entry.event.id),
    [newer.id, older.id]
  )
  assert.deepEqual(
    tiers.changes.map((entry) => entry.id),
    [edit.id]
  )
})

void test('older entries fill the list up to the floor before any go behind the fold', () => {
  assert.deepEqual(splitOlder(0, ['a', 'b', 'c', 'd']), { shown: ['a', 'b', 'c'], folded: ['d'] })
  assert.deepEqual(splitOlder(2, ['a', 'b']), { shown: ['a'], folded: ['b'] })
  assert.deepEqual(splitOlder(3, ['a']), { shown: [], folded: ['a'] })
  assert.deepEqual(splitOlder(1, []), { shown: [], folded: [] })
})
