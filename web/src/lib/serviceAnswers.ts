import { orderBy } from 'lodash-es'

import { getIncidentSeverityInfo } from '../constants/incidentSeverities'

import { stripMarkdown } from './strings'
import { formatDaysAgo } from './timeAgo'

import type {
  AttributeCategory,
  AttributeType,
  IncidentSeverity,
  IncidentState,
  VerificationStatus,
} from '@prisma/client'

/**
 * A negative attribute as the reader should see it. `note` is the per-service
 * detail, which says the specific thing the shared title cannot.
 */
export type Caveat = {
  title: string
  note?: string | null
  /** Anchor of the full attribute card further down the page. */
  href?: string
}

export type ServiceAnswer = {
  tone: 'bad' | 'caution' | 'good' | 'unknown'
  /** Short enough to read at a glance, e.g. "No, guaranteed". */
  answer: string
  /** One sentence of why, in the reader's terms rather than the model's. */
  detail: string
  /** Named exceptions to the headline, costliest first. */
  caveats?: Caveat[]
  /** Incidents behind the headline, worst first, each linking to its card. */
  incidents?: IncidentLink[]
}

export type IncidentLink = { title: string; href: string; note: string }

const cleanTitle = (title: string) => title.replace(/[.;,]+$/, '')

const incidentAnchor = (eventId: number) => `event-${String(eventId)}`
export const checkAnchor = (stepId: number) => `check-${String(stepId)}`

export const attributeAnchor = (slug: string) => `attribute-${slug}`

/**
 * Answers "will it ask for your ID?".
 *
 * The headline follows the level, with one exception: a guaranteed no-KYC
 * service that carries a KYC-category caveat (a partner, a seller, a refund
 * path that can ask) reads "by them", since the guarantee stops at their own
 * door. KYC caveats are listed under the headline, unless a written policy
 * summary exists, which already says the specific thing.
 */
export function makeKycAnswer(
  kycLevel: number,
  kycCaveats: Caveat[] = [],
  kycPolicyMd?: string | null,
  isFlaggedScam = false
): ServiceAnswer {
  // A green KYC verdict beside a red scam verdict reads as an endorsement.
  if (isFlaggedScam) {
    return {
      tone: 'bad',
      answer: 'Flagged as a scam',
      detail: 'Whatever its KYC policy says, do not use it.',
    }
  }
  const base = baseKycAnswer(kycLevel)
  const policy = kycPolicyMd ? stripMarkdown(kycPolicyMd) : ''
  if (policy) return { ...base, detail: policy }
  // Once the headline already says yes there is nothing left to qualify.
  if (kycCaveats.length === 0 || base.tone === 'bad') return base
  // A guarantee from the service is not a guarantee from its partners, and the
  // KYC category holds exactly the attributes that say someone else may ask.
  if (kycLevel === 0) {
    return {
      tone: 'caution',
      answer: 'No KYC by them',
      detail: 'They never ask for ID themselves. A partner they route you through might:',
      caveats: kycCaveats,
    }
  }
  return { ...base, caveats: kycCaveats }
}

function baseKycAnswer(kycLevel: number): ServiceAnswer {
  switch (kycLevel) {
    case 0:
      return {
        tone: 'good',
        answer: 'No KYC, guaranteed',
        detail: 'Their terms state that identity verification will never be requested.',
      }
    case 1:
      return {
        tone: 'caution',
        answer: 'No KYC mentioned',
        detail: "Their terms don't mention ID checks, but they don't rule them out either.",
      }
    case 2:
      return {
        tone: 'caution',
        answer: 'KYC only in rare cases',
        detail:
          'No routine ID checks, but they may ask if a legal order or their own risk review compels them.',
      }
    case 3:
      return {
        tone: 'bad',
        answer: 'Can demand KYC without warning',
        detail:
          'They can demand ID mid-flow, from AML checks or partner rules, and hold what is in progress until you comply.',
      }
    default:
      return {
        tone: 'bad',
        answer: 'KYC required',
        detail: 'Identity verification is required to use the main features.',
      }
  }
}

type OpenIncident = {
  id: number
  title: string
  severity: IncidentSeverity
  state: IncidentState
  occurredAt: Date
  resolvedAt: Date | null
}

type SafetyInput = {
  verificationStatus: VerificationStatus
  /**
   * Incidents still carrying a trust penalty. A resolved one stays here until
   * its decay window ends (90 days to 18 months by severity), which is what
   * "recent" means below. Faded ones do not count.
   */
  incidents: OpenIncident[]
  /** False when nobody has reviewed the listing, so a low score means "unknown". */
  hasBeenReviewed: boolean
  /** The trust half of `pickCaveats`. */
  caveats: Caveat[]
  /** Review checks that failed or raised a warning, each linking to its entry. */
  checks: FlaggedCheck[]
  /** Set while a listing counts as recently approved, so a clean record is also a short one. */
  recentlyApprovedAt: Date | null
}

export type FlaggedCheck = { title: string; href: string; failed: boolean }

/**
 * How far an ongoing incident overrides the rest of the answer. LOW is worth
 * the alert box above the panel but not a change of verdict; a patched server
 * list is not a reason to stay away.
 */
const TONE_BY_SEVERITY: Record<IncidentSeverity, Extract<ServiceAnswer['tone'], 'bad' | 'caution'> | null> = {
  LOW: null,
  MEDIUM: 'caution',
  HIGH: 'bad',
  CRITICAL: 'bad',
}

const monthFormatter = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' })

/**
 * Answers "is your money safe here?".
 *
 * An ongoing incident outranks the score. The score is a slow-moving average; a
 * service currently holding people's funds is a fact about today. A resolved
 * incident still inside its decay window reads as recent: named, in caution,
 * and left to the reader to weigh.
 */
export function makeSafetyAnswer({
  verificationStatus,
  incidents,
  hasBeenReviewed,
  caveats,
  checks,
  recentlyApprovedAt,
}: SafetyInput): ServiceAnswer {
  if (verificationStatus === 'VERIFICATION_FAILED') {
    return {
      tone: 'bad',
      answer: 'Flagged as a scam',
      detail: 'This service failed our checks. Do not use it.',
    }
  }

  // Our own failed or warned checks ride along under any incident verdict.
  const flaggedChecks = checks.map((check) => ({ title: check.title, href: check.href }))

  const ongoing = orderBy(
    incidents.filter((incident) => incident.state === 'ONGOING'),
    (incident) => getIncidentSeverityInfo(incident.severity).order,
    'desc'
  )
  const worst = ongoing[0]
  const tone = worst && TONE_BY_SEVERITY[worst.severity]
  if (worst && tone) {
    const plural = ongoing.length > 1
    return {
      tone,
      answer:
        tone === 'bad'
          ? plural
            ? `${String(ongoing.length)} ongoing incidents`
            : 'Ongoing incident'
          : 'Open incident',
      detail: '',
      incidents: ongoing.map((incident) => ({
        title: cleanTitle(incident.title),
        href: `#${incidentAnchor(incident.id)}`,
        note: `Unresolved since ${monthFormatter.format(incident.occurredAt)}`,
      })),
      caveats: flaggedChecks,
    }
  }

  const recent = orderBy(
    incidents.filter((incident) => incident.state === 'RESOLVED'),
    (incident) => getIncidentSeverityInfo(incident.severity).order,
    'desc'
  )
  if (recent.length > 0) {
    return {
      tone: 'caution',
      answer: recent.length > 1 ? 'Recent incidents' : 'Recent incident',
      detail: '',
      incidents: recent.map((incident) => ({
        title: cleanTitle(incident.title),
        href: `#${incidentAnchor(incident.id)}`,
        note: incident.resolvedAt ? `Resolved ${monthFormatter.format(incident.resolvedAt)}` : 'Resolved',
      })),
      caveats: flaggedChecks,
    }
  }

  if (!hasBeenReviewed) {
    return {
      tone: 'unknown',
      answer: 'Not reviewed yet',
      detail: 'Nobody has checked this listing yet. Everything on it comes from whoever submitted it.',
      caveats: flaggedChecks,
    }
  }
  // A check we ran and that went wrong outranks the tidy "nothing on record":
  // it is our own finding, not a policy clause.
  if (checks.length > 0) {
    const failed = checks.filter((check) => check.failed)
    const count = (n: number, one: string, many: string) => (n === 1 ? one : `${String(n)} ${many}`)
    return {
      tone: failed.length > 0 ? 'bad' : 'caution',
      answer:
        failed.length > 0
          ? count(failed.length, 'A check failed', 'checks failed')
          : count(checks.length, 'A check raised a warning', 'checks raised warnings'),
      detail: '',
      caveats: flaggedChecks,
    }
  }

  const shortRecord = recentlyApprovedAt
    ? `Approved ${formatDaysAgo(recentlyApprovedAt)}, so the record is short.`
    : ''

  // The costliest caveat is the headline: "May freeze or seize funds" tells the
  // reader something, "2 caveats" only tells them to keep reading. Caveats
  // arrive sorted, costliest first.
  const first = caveats[0]
  if (first) {
    const others = caveats.length - 1
    return {
      tone: 'caution',
      answer: others === 0 ? first.title : `${first.title}, and ${String(others)} more`,
      detail: [
        shortRecord,
        others === 0
          ? 'Nothing on record against it. One thing to know:'
          : 'Nothing on record against it, but worth knowing before you use it:',
      ]
        .filter(Boolean)
        .join(' '),
      caveats,
    }
  }

  // A LOW incident is still open at this point, and "nothing on record" would
  // contradict the notice sitting right above the panel. The score itself is
  // never read: it is one weighting of these same facts, not a fact.
  const record =
    ongoing.length > 0 ? 'Reviewed. Nothing serious beyond the notice above.' : 'Reviewed and clean so far.'

  return {
    tone: 'good',
    answer: 'Nothing negative on record',
    detail: [record, shortRecord].filter(Boolean).join(' '),
  }
}

type CaveatSource = Omit<Caveat, 'href'> & {
  slug: string
  category: AttributeCategory
  type: AttributeType
  privacyPoints: number
  trustPoints: number
}

/**
 * Splits a service's attributes into the caveats each question shows.
 *
 * Category is the routing: KYC attributes qualify the ID answer, TRUST ones the
 * trust answer, and PRIVACY ones stay in the list below. A moderator marks
 * "listed but not a concern" the way they already do, with type INFO or zero
 * points, so no extra field is needed. The costliest come first because only
 * the first couple are shown.
 */
export function pickCaveats(attributes: CaveatSource[]): { kyc: Caveat[]; trust: Caveat[] } {
  const concerns = orderBy(
    attributes.filter(
      (attribute) =>
        (attribute.type === 'BAD' || attribute.type === 'WARNING') &&
        attribute.privacyPoints + attribute.trustPoints !== 0
    ),
    (attribute) => attribute.privacyPoints + attribute.trustPoints,
    'asc'
  )
  const toCaveat = ({ title, note, slug }: CaveatSource): Caveat => ({
    title,
    note,
    href: `#${attributeAnchor(slug)}`,
  })

  return {
    kyc: concerns.filter((attribute) => attribute.category === 'KYC').map(toCaveat),
    trust: concerns.filter((attribute) => attribute.category === 'TRUST').map(toCaveat),
  }
}

/** The answer as one plain sentence, for structured data. */
export function answerText({ answer, detail, caveats = [], incidents = [] }: ServiceAnswer): string {
  const caveatText = caveats.map((caveat) => (caveat.note?.trim() ? caveat.note : caveat.title)).join('; ')
  const incidentText = incidents
    .map((incident) => `${incident.title} (${incident.note.toLowerCase()})`)
    .join('; ')
  return [`${answer}.`, detail, incidentText && `${incidentText}.`, caveatText && `${caveatText}.`]
    .filter(Boolean)
    .join(' ')
}

/**
 * The two questions, with the service named so they read the way people ask
 * them. The trust one is worded for what the visitor stands to lose: "Is your
 * money safe" is the wrong question for a VPN, where you pay a few euros and
 * the real exposure is your traffic.
 */
export function makeQuestions(serviceName: string, categories: { holdsFunds: boolean }[]) {
  const holdsFunds = categories.some((category) => category.holdsFunds)
  return {
    kyc: `Will ${serviceName} ask for your ID?`,
    trust: holdsFunds ? `Is your money safe on ${serviceName}?` : `Can you trust ${serviceName}?`,
  }
}

/** Verification states that mean a person has actually looked at the listing. */
const REVIEWED_STATUSES: VerificationStatus[] = ['VERIFICATION_SUCCESS', 'VERIFICATION_FAILED', 'APPROVED']

export function hasBeenReviewed(verificationStatus: VerificationStatus): boolean {
  return REVIEWED_STATUSES.includes(verificationStatus)
}
