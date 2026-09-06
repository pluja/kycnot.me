import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  hasBeenReviewed,
  makeKycAnswer,
  makeSafetyAnswer,
  answerText,
  makeQuestions,
  pickCaveats,
} from './serviceAnswers'

void test('KYC levels map to distinct answers, and 0 is not the same as 1', () => {
  const guaranteed = makeKycAnswer(0)
  const unmentioned = makeKycAnswer(1)
  assert.equal(guaranteed.tone, 'good')
  assert.equal(unmentioned.tone, 'caution')
  assert.notEqual(guaranteed.answer, unmentioned.answer)
})

void test('shotgun KYC and mandatory KYC both read as bad', () => {
  assert.equal(makeKycAnswer(3).tone, 'bad')
  assert.equal(makeKycAnswer(4).tone, 'bad')
})

void test('rare KYC reads as rare, matching the level it comes from', () => {
  assert.equal(makeKycAnswer(2).answer, 'KYC only in rare cases')
})

const wizardSwapPolicy =
  'Funds may be frozen or seized based on manual submissions from unnamed external researchers to their internal blacklist. Source of Funds documentation may be required to release a freeze. No published policies or appeal process exists.'

void test('a written KYC policy replaces the stock sentence and the caveat titles', () => {
  const answer = makeKycAnswer(2, [{ title: 'SoF may be required for refunds' }], wizardSwapPolicy)
  assert.equal(answer.answer, 'KYC only in rare cases')
  assert.equal(answer.detail, wizardSwapPolicy)
  assert.equal(answer.caveats, undefined)
})

void test('an empty policy falls back to the stock sentence', () => {
  assert.deepEqual(makeKycAnswer(1, [], '  '), makeKycAnswer(1))
})

const base = {
  verificationStatus: 'VERIFICATION_SUCCESS' as const,
  incidents: [],
  hasBeenReviewed: true,
  caveats: [],
  checks: [],
  recentlyApprovedAt: null,
}

const incident = {
  id: 42,
  title: 'Withdrawals frozen for 23 users',
  severity: 'HIGH' as const,
  state: 'ONGOING' as const,
  occurredAt: new Date('2026-06-10'),
  resolvedAt: null,
}

void test('a severe open incident outranks a healthy trust score and is named', () => {
  // The SolvoCard shape: strong privacy, decent-looking overall, funds frozen.
  const answer = makeSafetyAnswer({ ...base, incidents: [incident] })
  assert.equal(answer.tone, 'bad')
  assert.equal(answer.answer, 'Ongoing incident')
  assert.deepEqual(answer.incidents, [
    { title: 'Withdrawals frozen for 23 users', href: '#event-42', note: 'Unresolved since Jun 2026' },
  ])
})

void test('a medium incident is a caution, a low one leaves the verdict alone', () => {
  // Mullvad: an acknowledged fingerprinting bug mid-patch is worth the alert
  // box, not a "stay away".
  const medium = makeSafetyAnswer({ ...base, incidents: [{ ...incident, severity: 'MEDIUM' }] })
  assert.equal(medium.tone, 'caution')
  assert.equal(medium.answer, 'Open incident')

  const low = makeSafetyAnswer({ ...base, incidents: [{ ...incident, severity: 'LOW' }] })
  assert.equal(low.tone, 'good')
  assert.match(low.detail, /beyond the notice above/)
})

void test('the worst ongoing incident leads and the rest are counted', () => {
  const answer = makeSafetyAnswer({
    ...base,
    incidents: [
      { ...incident, title: 'Support unresponsive', severity: 'MEDIUM' },
      { ...incident, severity: 'CRITICAL' },
    ],
  })
  assert.equal(answer.tone, 'bad')
  assert.equal(answer.answer, '2 ongoing incidents')
  assert.deepEqual(
    answer.incidents?.map((entry) => entry.title),
    ['Withdrawals frozen for 23 users', 'Support unresponsive']
  )
})

void test('a resolved incident still in its decay window reads as recent, in caution', () => {
  const answer = makeSafetyAnswer({
    ...base,
    incidents: [{ ...incident, state: 'RESOLVED', resolvedAt: new Date('2026-07-02') }],
  })
  assert.equal(answer.tone, 'caution')
  assert.equal(answer.answer, 'Recent incident')
  assert.deepEqual(answer.incidents, [
    { title: 'Withdrawals frozen for 23 users', href: '#event-42', note: 'Resolved Jul 2026' },
  ])
})

void test('a flagged service is never described as safe', () => {
  const answer = makeSafetyAnswer({ ...base, verificationStatus: 'VERIFICATION_FAILED' })
  assert.equal(answer.tone, 'bad')
})

void test('an unreviewed listing reads as unknown, not as bad', () => {
  const answer = makeSafetyAnswer({
    ...base,
    verificationStatus: 'COMMUNITY_CONTRIBUTED',
    hasBeenReviewed: false,
  })
  assert.equal(answer.tone, 'unknown')
  assert.equal(answer.answer, 'Not reviewed yet')
})

void test('a clean record reads as clean regardless of the score', () => {
  // The score is a weighting of the same facts, so the verdict never reads it.
  const answer = makeSafetyAnswer(base)
  assert.equal(answer.tone, 'good')
  assert.equal(answer.answer, 'Nothing negative on record')
})

void test('the costliest caveat is the headline, the rest a count', () => {
  const caveats = [{ title: 'No-refund policy' }, { title: 'May suspend your account' }]
  const answer = makeSafetyAnswer({ ...base, caveats })
  assert.equal(answer.tone, 'caution')
  assert.equal(answer.answer, 'No-refund policy, and 1 more')
  assert.match(answer.detail, /worth knowing/)
  assert.deepEqual(answer.caveats, caveats)
})

void test('a single caveat is the headline on its own', () => {
  const answer = makeSafetyAnswer({ ...base, caveats: [{ title: 'No-refund policy' }] })
  assert.equal(answer.answer, 'No-refund policy')
  assert.equal(answer.detail, 'Nothing on record against it. One thing to know:')
})

void test('hasBeenReviewed only counts states where a person looked', () => {
  assert.equal(hasBeenReviewed('VERIFICATION_SUCCESS'), true)
  assert.equal(hasBeenReviewed('APPROVED'), true)
  assert.equal(hasBeenReviewed('COMMUNITY_CONTRIBUTED'), false)
})

void test('the questions name the service and fit what the visitor stands to lose', () => {
  const exchange = { holdsFunds: true }
  const vpn = { holdsFunds: false }
  assert.equal(makeQuestions('Kraken', [exchange]).trust, 'Is your money safe on Kraken?')
  assert.equal(makeQuestions('Mullvad', [vpn]).trust, 'Can you trust Mullvad?')
  assert.equal(makeQuestions('Mullvad', [vpn]).kyc, 'Will Mullvad ask for your ID?')
  assert.equal(makeQuestions('X', []).trust, 'Can you trust X?')
  // A service in both buckets keeps the sharper question.
  assert.equal(makeQuestions('X', [vpn, exchange]).trust, 'Is your money safe on X?')
})

void test('a guaranteed service with a KYC caveat reads "by them", caveats listed', () => {
  // Trocador: a genuine no-KYC guarantee, but a partner in the chain can ask.
  const answer = makeKycAnswer(0, [{ title: 'KYC depends on partners' }])
  assert.equal(answer.tone, 'caution')
  assert.equal(answer.answer, 'No KYC by them')
  assert.deepEqual(answer.caveats, [{ title: 'KYC depends on partners' }])
})

void test('a KYC caveat on a non-guaranteed level is listed without changing the headline', () => {
  const answer = makeKycAnswer(1, [{ title: 'Some sellers may require KYC' }])
  assert.equal(answer.answer, 'No KYC mentioned')
  assert.deepEqual(answer.caveats, [{ title: 'Some sellers may require KYC' }])
})

void test('an unqualified no-KYC policy reads as guaranteed with nothing listed', () => {
  assert.deepEqual(makeKycAnswer(0), makeKycAnswer(0, []))
  assert.equal(makeKycAnswer(0).answer, 'No KYC, guaranteed')
  assert.equal(makeKycAnswer(0).caveats, undefined)
})

void test('a level that already says yes drops its caveats instead of contradicting itself', () => {
  // Kraken read "Yes, but may require KYC", which is noise.
  assert.deepEqual(makeKycAnswer(4, [{ title: 'Soft KYC' }]), makeKycAnswer(4))
  assert.deepEqual(makeKycAnswer(3, [{ title: 'Soft KYC' }]), makeKycAnswer(3))
})

const source = {
  slug: 'some-attribute',
  privacyPoints: -1,
  trustPoints: 0,
  type: 'WARNING' as const,
}

void test('caveats route by category: KYC to the ID answer, TRUST to the trust answer', () => {
  const { kyc, trust } = pickCaveats([
    { ...source, title: 'KYC depends on partners', category: 'KYC' },
    { ...source, title: 'Custodial wallet', category: 'TRUST', trustPoints: -5 },
  ])
  assert.deepEqual(
    kyc.map((caveat) => caveat.title),
    ['KYC depends on partners']
  )
  assert.deepEqual(
    trust.map((caveat) => caveat.title),
    ['Custodial wallet']
  )
})

void test('privacy attributes stay in the list, and so does anything that costs nothing', () => {
  // The synthetic "Mandatory KYC" attribute is PRIVACY; it is already the ID headline.
  const { kyc, trust } = pickCaveats([
    { ...source, title: 'Mandatory KYC', category: 'PRIVACY', privacyPoints: -10 },
    { ...source, title: 'Third-Party Liquidity', category: 'TRUST', privacyPoints: 0 },
    { ...source, title: 'Accepts Monero', category: 'PRIVACY', type: 'GOOD' },
  ])
  assert.deepEqual(kyc, [])
  assert.deepEqual(trust, [])
})

void test('the costliest caveats come first so the shown pair is the pair that matters', () => {
  const { trust } = pickCaveats([
    { ...source, title: 'Hybrid infrastructure', category: 'TRUST', trustPoints: -1 },
    { ...source, title: 'Potential risk', category: 'TRUST', privacyPoints: -10, trustPoints: -15 },
    { ...source, title: 'Custodial wallet', category: 'TRUST', privacyPoints: -3, trustPoints: -5 },
  ])
  assert.deepEqual(
    trust.map((caveat) => caveat.title),
    ['Potential risk', 'Custodial wallet', 'Hybrid infrastructure']
  )
})

void test('a note travels with its caveat', () => {
  const { kyc } = pickCaveats([
    { ...source, title: 'KYC depends on partners', category: 'KYC', note: 'The partner can ask.' },
  ])
  assert.deepEqual(kyc, [
    { title: 'KYC depends on partners', note: 'The partner can ask.', href: '#attribute-some-attribute' },
  ])
})

void test('the structured-data answer folds headline, detail and caveats into prose', () => {
  const text = answerText({
    tone: 'good',
    answer: 'No KYC, guaranteed',
    detail: 'Their terms say so.',
    caveats: [{ title: 'Transaction monitoring' }],
  })
  assert.equal(text, 'No KYC, guaranteed. Their terms say so. Transaction monitoring.')
})

void test('a failed review check is a verdict of its own, linking to the entry', () => {
  const answer = makeSafetyAnswer({
    ...base,
    checks: [{ title: 'Questionable security practices', href: '#check-7', failed: true }],
  })
  assert.equal(answer.tone, 'bad')
  assert.equal(answer.answer, 'A check failed')
  assert.deepEqual(answer.caveats, [{ title: 'Questionable security practices', href: '#check-7' }])
})

void test('warnings alone are a caution, and are counted', () => {
  const answer = makeSafetyAnswer({
    ...base,
    checks: [
      { title: 'Slow support', href: '#check-1', failed: false },
      { title: 'Unclear refunds', href: '#check-2', failed: false },
    ],
  })
  assert.equal(answer.tone, 'caution')
  assert.equal(answer.answer, '2 checks raised warnings')
})

void test('an unreviewed listing keeps its verdict and lists its flagged checks under it', () => {
  const answer = makeSafetyAnswer({
    ...base,
    verificationStatus: 'COMMUNITY_CONTRIBUTED',
    hasBeenReviewed: false,
    checks: [{ title: 'Due Diligence Notice', href: '#check-3', failed: false }],
  })
  assert.equal(answer.answer, 'Not reviewed yet')
  assert.deepEqual(answer.caveats, [{ title: 'Due Diligence Notice', href: '#check-3' }])
})

void test('a flagged scam gets the scam verdict in the KYC box too', () => {
  const answer = makeKycAnswer(0, [], null, true)
  assert.equal(answer.tone, 'bad')
  assert.equal(answer.answer, 'Flagged as a scam')
})

void test('a recently approved clean listing says its record is short', () => {
  const answer = makeSafetyAnswer({ ...base, recentlyApprovedAt: new Date() })
  assert.equal(answer.answer, 'Nothing negative on record')
  assert.match(answer.detail, /so the record is short\.$/)
})
