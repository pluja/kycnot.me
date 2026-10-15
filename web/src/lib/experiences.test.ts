import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  canReadComment,
  canReadEvidence,
  experienceInput,
  editedOutcome,
  outcomeForProblems,
  issuesNeedingProof,
  outcomeLabel,
  problemStatus,
} from './experiences'

const author = { id: 1, admin: false, capabilities: [] }
const unrelated = { id: 2, admin: false, capabilities: [] }
const moderator = { id: 3, admin: false, capabilities: ['comments:moderate'] }

void test('pending and rejected posts are private even when their IDs are known', () => {
  for (const status of ['PENDING', 'REJECTED'] as const) {
    const post = { authorId: 1, status }
    assert.equal(canReadComment(null, post), false)
    assert.equal(canReadComment(unrelated, post), false)
    assert.equal(canReadComment(author, post), true)
    assert.equal(canReadComment(moderator, post), true)
  }
})

void test('private evidence is restricted to its author and comment moderators', () => {
  const evidence = { authorId: 1, removedAt: null }
  assert.equal(canReadEvidence(null, evidence), false)
  assert.equal(canReadEvidence(unrelated, evidence), false)
  assert.equal(canReadEvidence({ ...unrelated, capabilities: ['cases:manage'] }, evidence), false)
  assert.equal(canReadEvidence(author, evidence), true)
  assert.equal(canReadEvidence(moderator, evidence), true)
  assert.equal(canReadEvidence(moderator, { ...evidence, removedAt: new Date() }), false)
  const post = { authorId: 9, affiliatedUserIds: [] }
  assert.equal(
    canReadEvidence(moderator, { ...evidence, post: { ...post, affiliatedUserIds: [moderator.id] } }),
    false
  )
  assert.equal(canReadEvidence(moderator, { ...evidence, post: { ...post, authorId: moderator.id } }), false)
  assert.equal(
    canReadEvidence(
      { ...moderator, admin: true },
      { ...evidence, post: { ...post, authorId: moderator.id } }
    ),
    true
  )
})

void test('optional form blanks stay unspecified and future dates are rejected', () => {
  const parsed = experienceInput.parse({ sentiment: '', occurredMonth: '' })
  assert.equal(parsed.sentiment, undefined)
  assert.equal(parsed.occurredMonth, undefined)
  assert.equal(parsed.outcome, 'UNSPECIFIED')
  assert.equal(experienceInput.safeParse({ occurredMonth: '9999-01' }).success, false)
})

void test('missing optional form fields accept FormData null values', () => {
  const parsed = experienceInput.parse({ occurredMonth: null, sentiment: null })
  assert.equal(parsed.occurredMonth, undefined)
  assert.equal(parsed.occurredMonth, undefined)
  assert.equal(parsed.sentiment, undefined)
})

void test('the problems answer maps to one outcome', () => {
  const answer = { noProblems: false, issues: [], resolved: false }
  assert.equal(outcomeForProblems(answer), 'UNSPECIFIED')
  assert.equal(outcomeForProblems({ ...answer, noProblems: true }), 'NO_ISSUE')
  assert.equal(outcomeForProblems({ ...answer, issues: ['FUNDS_BLOCKED'] }), 'ONGOING')
  assert.equal(outcomeForProblems({ ...answer, issues: ['OTHER'], resolved: true }), 'RESOLVED')
})

void test('a tagged problem shows a status only when the author gave one', () => {
  assert.equal(outcomeLabel('UNSPECIFIED'), null)
  assert.equal(outcomeLabel('NO_ISSUE'), 'No issue reported')
  assert.equal(problemStatus('RESOLVED'), 'resolved')
  assert.equal(problemStatus('ONGOING'), 'ongoing')
  assert.equal(problemStatus('UNSPECIFIED'), null)
})

void test('conflicting problem answers resolve without JavaScript', () => {
  assert.equal(
    outcomeForProblems({ noProblems: true, issues: ['KYC_REQUESTED'], resolved: false }),
    'ONGOING'
  )
  assert.equal(
    outcomeForProblems({ noProblems: true, issues: ['KYC_REQUESTED'], resolved: true }),
    'RESOLVED'
  )
  assert.equal(outcomeForProblems({ noProblems: false, issues: [], resolved: true }), 'UNSPECIFIED')
  assert.equal(outcomeForProblems({ noProblems: true, issues: [], resolved: true }), 'NO_ISSUE')
})

void test('a month typed as YYYY-MM is accepted where browsers have no month picker', () => {
  assert.equal(experienceInput.parse({ occurredMonth: ' 2025-03 ' }).occurredMonth, '2025-03')
  assert.equal(experienceInput.safeParse({ occurredMonth: '03/2025' }).success, false)
  assert.equal(experienceInput.safeParse({ occurredMonth: '2025-13' }).success, false)
})

void test('an edit that leaves the problems answer alone keeps the stored outcome', () => {
  const oldPost = { issues: ['FUNDS_BLOCKED' as const], outcome: 'UNSPECIFIED' as const }
  const untouched = { noProblems: false, issues: ['FUNDS_BLOCKED' as const], resolved: false }
  assert.equal(editedOutcome(oldPost, untouched), 'UNSPECIFIED')
  assert.equal(editedOutcome(oldPost, { ...untouched, resolved: true }), 'RESOLVED')
  assert.equal(
    editedOutcome(oldPost, { ...untouched, issues: ['FUNDS_BLOCKED', 'KYC_REQUESTED'] }),
    'ONGOING'
  )
  assert.equal(
    editedOutcome({ issues: [], outcome: 'NO_ISSUE' }, { noProblems: true, issues: [], resolved: false }),
    'NO_ISSUE'
  )
  assert.equal(
    editedOutcome({ issues: [], outcome: 'NO_ISSUE' }, { noProblems: false, issues: [], resolved: false }),
    'UNSPECIFIED'
  )
})

void test('a KYC request or held funds needs proof, other problems do not', () => {
  assert.deepEqual(issuesNeedingProof(['KYC_REQUESTED', 'FUNDS_BLOCKED', 'OTHER']), [
    'KYC_REQUESTED',
    'FUNDS_BLOCKED',
  ])
  assert.deepEqual(issuesNeedingProof(['OTHER']), [])
})
