import { z } from 'astro/zod'
import { format } from 'date-fns'

import { evidenceFindingsByValue } from '../constants/experiences'

import type {
  CommentStatus,
  EvidenceFinding,
  EvidenceKind,
  ModerationAction,
  PrivateProofStatus,
} from '@prisma/client'

export const defaultProofHint = 'Order ID, order link or an uploaded screenshot.'

type ProofSettings = { proofLookupUrl: string | null; proofIdPattern: string | null }

type ProofClassification = {
  kind: EvidenceKind
  normalizedId: string | null
  formatValid: boolean | null
}

const transactionPatterns = [
  /^(0x)?[0-9a-f]{64}$/i,
  /^0x[0-9a-f]{40}$/i,
  /^(bc1|tb1|ltc1)[0-9a-z]{25,90}$/i,
  /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/,
  /^[48][1-9A-HJ-NP-Za-km-z]{94,105}$/,
]
const orderIdShape = /^[A-Za-z0-9_-]{3,64}$/
const linkShape = /^https?:\/\/\S+$/i

// urlInText finds links inside free text; unlike linkShape it stops at separators and drops trailing punctuation.
const urlInText = /https?:\/\/[^\s;,<>"']*[^\s;,<>"'.)]/gi
const imageHosts = [
  'ibb.co',
  'imgbb.com',
  'imgur.com',
  'postimg.cc',
  'postimages.org',
  'prnt.sc',
  'gyazo.com',
  'imgbox.com',
  'catbox.moe',
]

type ProofTextPart = { text: string; url?: string }

export function proofTextParts(text: string): ProofTextPart[] {
  const parts: ProofTextPart[] = []
  let consumedUntil = 0
  for (const match of text.matchAll(urlInText)) {
    if (match.index > consumedUntil) parts.push({ text: text.slice(consumedUntil, match.index) })
    parts.push({ text: match[0], url: match[0] })
    consumedUntil = match.index + match[0].length
  }
  if (consumedUntil < text.length) parts.push({ text: text.slice(consumedUntil) })
  return parts
}

const linksIn = (text: string) => text.match(urlInText) ?? []

export const countProofLinks = (text: string) => linksIn(text).length

export function linksToImageHost(text: string) {
  return linksIn(text).some((link) => {
    try {
      const host = new URL(link).hostname.toLowerCase().replace(/\.$/, '')
      return imageHosts.some((imageHost) => host === imageHost || host.endsWith(`.${imageHost}`))
    } catch {
      return false
    }
  })
}

export const imageHostLinkMessage =
  "Links to image sites aren't accepted. Upload the screenshot in the Screenshot field instead. If you have several, combine them into one image."

const isTransactionLike = (value: string) => transactionPatterns.some((pattern) => pattern.test(value))

const PROOF_ID_MAX_LENGTH = 64

// proofIdRegex compiles an admin-entered pattern anchored to the whole ID. Groups,
// backreferences and more than four quantifiers are refused, which rules out
// slow backtracking and escaping the anchors; classes and alternation still work.
export function proofIdRegex(pattern: string | null) {
  if (!pattern || /[()]|\\[1-9k]/.test(pattern)) return null
  if ((pattern.match(/[*+?]|\{\d/g) ?? []).length > 4) return null
  try {
    return new RegExp(`^(?:${pattern})$`)
  } catch {
    return null
  }
}

// suggestProofIdPattern describes the accepted IDs of a service as one character class and length, the shape
// most order IDs share. It gives up on characters outside letters, digits, dashes and underscores.
export function suggestProofIdPattern(ids: string[]) {
  if (ids.length < 3) return null
  const chars = [...new Set(ids.join(''))]
  if (chars.some((char) => !/[A-Za-z0-9_-]/.test(char))) return null
  const lengths = ids.map((id) => id.length)
  const [shortest, longest] = [Math.min(...lengths), Math.max(...lengths)]
  const has = (pattern: RegExp) => chars.some((char) => pattern.test(char))
  const hex = shortest >= 8 && chars.every((char) => /[0-9a-f]/.test(char))
  const charClass = hex
    ? 'a-f0-9'
    : [
        has(/[A-Z]/) && 'A-Z',
        has(/[a-z]/) && 'a-z',
        has(/[0-9]/) && '0-9',
        has(/_/) && '_',
        has(/-/) && '\\-',
      ]
        .filter(Boolean)
        .join('')
  const length = shortest === longest ? String(shortest) : `${String(shortest)},${String(longest)}`
  // A wide length range means the IDs come in more than one format, so the class says little.
  return { pattern: `[${charClass}]{${length}}`, loose: longest - shortest > 4 }
}

function idFromLookupLink(link: string, template: string | null) {
  if (!template?.includes('{id}')) return null
  const [prefix = '', suffix = ''] = template.split('{id}')
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^${escape(prefix)}([^/?#]+)${escape(suffix)}(?:[/?#].*)?$`, 'i').exec(
    link.replace(/^http:/i, 'https:')
  )
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

// notAnId matches network names, durations and amounts: they mix letters and digits too, but never count as an
// ID inside a note.
const notAnId = [/^(trc|erc|bep|brc|spl)\d+$/i, /^\d+(h|hrs?|m|mins?|s|secs?|k|x|st|nd|rd|th|fa)$/i]
const idLikeWord = /^[A-Za-z0-9_-]{5,64}$/

// idInNote finds the single order ID or lookup link inside free text, such as "Swap ID IF00D9". A word that
// matches the service pattern wins; otherwise a word mixing letters and digits. Two different candidates make
// the note ambiguous, so it stays a note.
function idInNote(text: string, settings: ProofSettings, pattern: RegExp | null) {
  const words = text
    .split(/[\s,;()"']+/)
    .flatMap((word) => (linkShape.test(word) ? [word] : word.split(/[:#]+/)))
    .map((word) => word.replace(/[.!?]+$/, ''))
  for (const word of words.filter((candidate) => linkShape.test(candidate))) {
    const id = idFromLookupLink(word, settings.proofLookupUrl?.replace(/^http:/i, 'https:') ?? null)
    if (id) return { kind: 'LOOKUP_LINK' as const, id }
  }
  const idLike = words.filter(
    (word) =>
      idLikeWord.test(word) &&
      /[0-9]/.test(word) &&
      /[A-Za-z]/.test(word) &&
      !isTransactionLike(word) &&
      !notAnId.some((shape) => shape.test(word))
  )
  const matching = pattern
    ? words.filter((word) => word.length <= PROOF_ID_MAX_LENGTH && pattern.test(word))
    : []
  const candidates = [...new Set(matching.length > 0 ? matching : idLike)]
  return candidates.length === 1 && candidates[0] ? { kind: 'ORDER_ID' as const, id: candidates[0] } : null
}

export function classifyProof(
  body: string | null | undefined,
  hasImage: boolean,
  settings: ProofSettings
): ProofClassification {
  const text = body?.trim() ?? ''
  const pattern = proofIdRegex(settings.proofIdPattern)
  const matchesPattern = (id: string) => id.length <= PROOF_ID_MAX_LENGTH && !!pattern?.test(id)
  const withId = (kind: EvidenceKind, id: string): ProofClassification => ({
    kind,
    normalizedId: id,
    formatValid: pattern ? matchesPattern(id) : null,
  })
  if (text && matchesPattern(text)) return withId('ORDER_ID', text)
  if (linkShape.test(text)) {
    const id = idFromLookupLink(text, settings.proofLookupUrl?.replace(/^http:/i, 'https:') ?? null)
    if (id) return withId('LOOKUP_LINK', id)
  }
  if (hasImage) return { kind: 'SCREENSHOT', normalizedId: null, formatValid: null }
  if (text && isTransactionLike(text)) {
    return { kind: 'TRANSACTION_ID', normalizedId: null, formatValid: false }
  }
  if (linkShape.test(text)) return { kind: 'EXTERNAL_LINK', normalizedId: null, formatValid: null }
  if (orderIdShape.test(text)) return withId('ORDER_ID', text)
  const found = idInNote(text, settings, pattern)
  if (found) return withId(found.kind, found.id)
  return { kind: 'NOTE', normalizedId: null, formatValid: null }
}

export type ProofInput = {
  removedAt: Date | null
  // False with no check means a moderator found nothing to check, such as a note without an order ID.
  needsCheck?: boolean
  legacyStatus?: PrivateProofStatus | null
  checks?: { finding: EvidenceFinding }[]
}

// proofStatus counts evidence only through the latest check a moderator published. Sorting and format checks never count on
// their own; they only help the moderator.
export function proofStatus(evidence: ProofInput): { counts: boolean; reason: string } {
  if (evidence.removedAt) return { counts: false, reason: 'It was removed.' }
  const latestFinding = evidence.checks?.[0]?.finding
  if (!latestFinding) {
    return evidence.needsCheck === false
      ? { counts: false, reason: 'A moderator found nothing to check, such as a note without an order ID.' }
      : { counts: false, reason: 'Waiting for a moderator check.' }
  }
  if (latestFinding === 'LEGACY') {
    return evidence.legacyStatus === 'APPROVED'
      ? { counts: true, reason: 'Accepted under the earlier, less detailed process.' }
      : { counts: false, reason: 'Not accepted under the earlier process.' }
  }
  if (latestFinding === 'SCREENSHOT_REVIEWED') {
    return { counts: true, reason: 'A moderator found the screenshot plausible.' }
  }
  if (evidenceFindingsByValue[latestFinding].counts) {
    return { counts: true, reason: 'A moderator accepted it.' }
  }
  if (latestFinding === 'ORDER_NOT_FOUND') {
    return { counts: false, reason: 'The service lookup did not find this order.' }
  }
  if (latestFinding === 'INCONSISTENT') {
    return { counts: false, reason: 'The check found it inconsistent.' }
  }
  return { counts: false, reason: 'A moderator could not check it.' }
}

export const countsAsProof = (evidence: ProofInput) => proofStatus(evidence).counts

// shownProofKind is the kind readers see next to a result. An order lookup is about the order ID and a screenshot
// review about the screenshot, whatever else came with the proof, so the kind always matches what was checked.
export function shownProofKind(kind: EvidenceKind, finding: EvidenceFinding | undefined): EvidenceKind {
  if ((finding === 'ORDER_FOUND' || finding === 'ORDER_NOT_FOUND') && kind !== 'LOOKUP_LINK') {
    return 'ORDER_ID'
  }
  if (finding === 'SCREENSHOT_REVIEWED') return 'SCREENSHOT'
  return kind
}

export type ProofSummary = 'checked' | 'none' | 'unchecked'

// summarizeProof is the single proof state shown for a post: checked as soon as one piece counts.
export function summarizeProof(evidence: ProofInput[]): ProofSummary {
  const live = evidence.filter((item) => !item.removedAt)
  if (live.some(countsAsProof)) return 'checked'
  return live.some((item) => publicProofView(item).state === 'unchecked') ? 'unchecked' : 'none'
}

type PublicProofView =
  | { state: 'notCounted' | 'removed' | 'unchecked' }
  | { state: 'result'; finding: EvidenceFinding; counts: boolean }

// publicProofView is what readers learn about one piece of evidence, so every surface agrees.
export function publicProofView(evidence: ProofInput): PublicProofView {
  if (evidence.removedAt) return { state: 'removed' }
  const latestFinding = evidence.checks?.[0]?.finding
  if (!latestFinding) return { state: evidence.needsCheck === false ? 'notCounted' : 'unchecked' }
  if (latestFinding === 'LEGACY' && evidence.legacyStatus !== 'APPROVED') return { state: 'notCounted' }
  return { state: 'result', finding: latestFinding, counts: proofStatus(evidence).counts }
}

// checkTimeline says when a proof was last checked and how many checks came before, newest check first.
export const checkTimeline = (checks: { checkedAt: Date | null }[]) => [
  checks[0]?.checkedAt && `Checked in ${format(checks[0].checkedAt, 'MMMM yyyy')}`,
  checks.length > 1 && `${(checks.length - 1).toString()} earlier`,
]

export function lookupUrlFor(template: string | null, id: string | null) {
  if (!template?.includes('{id}') || !id) return null
  return template.replace('{id}', encodeURIComponent(id))
}

// proofGateReasons are the hard gates under which the AI worker holds a post for its proof: the current claim gate in
// pyworker/pyworker/tasks/comment_moderation.py and the older ones that held any post with proof.
export const proofGateReasons = [
  'claim awaiting a proof check',
  'proof awaiting a moderator check',
  'private proof present',
]

const aiHoldSignals = z.object({
  recommendedAction: z.string().optional(),
  hardGateReason: z.string().min(1),
})

// getAiHardGateReason explains why the AI held a post. The worker records gate reasons on every verdict, but they
// only take effect on a HOLD.
export function getAiHardGateReason(comment: { aiAction: ModerationAction | null; aiSignals: unknown }) {
  if (comment.aiAction !== 'HOLD') return null
  const parsed = aiHoldSignals.safeParse(comment.aiSignals)
  return parsed.success ? parsed.data.hardGateReason : null
}

// isHeldOnlyForProof is true when an accepted proof check can publish the post on its own: the AI wanted to
// publish it, the proof gate was its only hold, no moderator has held it, and no other proof still waits.
export function isHeldOnlyForProof(
  post: {
    status: CommentStatus
    humanAction: ModerationAction | null
    aiAction: ModerationAction | null
    aiSignals: unknown
  },
  proofsStillWaiting: number
) {
  if (post.status !== 'PENDING' || post.humanAction || post.aiAction !== 'HOLD' || proofsStillWaiting > 0) {
    return false
  }
  const parsed = aiHoldSignals.safeParse(post.aiSignals)
  return (
    parsed.success &&
    parsed.data.recommendedAction === 'approve' &&
    proofGateReasons.includes(parsed.data.hardGateReason)
  )
}

export const checkedProofStaysMessage =
  'Checked proof stays, because it backs the result readers see. Contact us if you need it deleted.'
