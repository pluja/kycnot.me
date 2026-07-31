import type { Incident } from '@prisma/client'

// Mirrors calculate_trust_score() in prisma/triggers/02_service_score.sql. Keep
// these constants in sync with that function: the displayed penalty must equal
// the one baked into the stored trustScore.
/// Penalty applied while an incident is ongoing, before any decay. Exported so
/// the admin form quotes the real numbers instead of a copy that can drift.
export const FULL_PENALTY = { LOW: -5, MEDIUM: -12, HIGH: -22, CRITICAL: -35 } as const
const DECAY_WINDOW_DAYS = { LOW: 90, MEDIUM: 180, HIGH: 365, CRITICAL: 540 } as const
const RESOLUTION_STEP = {
  FUNDS_RECOVERED: 0.2,
  USERS_REIMBURSED: 0.3,
  PARTIAL: 0.5,
  FUNDS_LOST: 0.75,
  UNKNOWN: 0.5,
} as const

const MS_PER_DAY = 86_400_000

type PenaltyInput = Pick<Incident, 'outcome' | 'resolvedAt' | 'severity' | 'state' | 'trustOverride'>

export type IncidentTrustPenalty = {
  /// Current penalty in trust points (negative). Rounded for display.
  points: number
  /// Full penalty at full severity (negative), before resolution step-down/decay.
  fullPoints: number
  /// Fraction of the full penalty still active (0..1); drives the decay bar.
  decayRemaining: number
  /// True when the incident is resolved and still fading toward zero.
  isDecaying: boolean
  /// Date the penalty reaches zero (resolved incidents only).
  fadesOn: Date | null
}

function rawPenalty(incident: PenaltyInput, now: Date): number {
  if (incident.trustOverride !== null) return incident.trustOverride

  const full = FULL_PENALTY[incident.severity]
  if (incident.state !== 'RESOLVED' || incident.resolvedAt === null) return full

  const step = RESOLUTION_STEP[incident.outcome ?? 'UNKNOWN']
  const windowDays = DECAY_WINDOW_DAYS[incident.severity]
  const daysSinceResolved = (now.getTime() - incident.resolvedAt.getTime()) / MS_PER_DAY
  const decay = Math.max(0, 1 - daysSinceResolved / windowDays)
  return full * step * decay
}

export function computeIncidentTrustPenalty(
  incident: PenaltyInput,
  now: Date = new Date()
): IncidentTrustPenalty {
  const points = Math.round(rawPenalty(incident, now))
  const fullPoints = incident.trustOverride ?? FULL_PENALTY[incident.severity]

  if (
    incident.state !== 'RESOLVED' ||
    incident.resolvedAt === null ||
    incident.trustOverride !== null
  ) {
    return { points, fullPoints, decayRemaining: 1, isDecaying: false, fadesOn: null }
  }

  const fadesOn = new Date(
    incident.resolvedAt.getTime() + DECAY_WINDOW_DAYS[incident.severity] * MS_PER_DAY
  )
  const decayRemaining = fullPoints === 0 ? 0 : Math.max(0, Math.min(1, points / fullPoints))
  return { points, fullPoints, decayRemaining, isDecaying: points < 0, fadesOn }
}

// Rounds the sum (not each term) to match the SQL ROUND(SUM(...)) exactly.
export function totalIncidentTrustPenalty(incidents: PenaltyInput[], now: Date = new Date()): number {
  return Math.round(incidents.reduce((sum, incident) => sum + rawPenalty(incident, now), 0))
}
