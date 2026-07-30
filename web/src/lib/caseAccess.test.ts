import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CaseStatus, CaseVisibility } from '@prisma/client'

import { canViewCaseEvidence, isCasePublished, UNPUBLISHED_CASE_STATUSES } from './caseAccess'

type User = { id: number; admin: boolean; capabilities: string[] } | null

const staff: User = { id: 1, admin: true, capabilities: [] }
const reporter: User = { id: 2, admin: false, capabilities: [] }
const stranger: User = { id: 99, admin: false, capabilities: [] }
const anon: User = null

function evidence(
  visibility: CaseVisibility,
  {
    status = CaseStatus.OPEN,
    reportedById = 2,
    participants = [],
  }: { status?: CaseStatus; reportedById?: number | null; participants?: number[] } = {}
) {
  return {
    visibility,
    case: {
      status,
      reportedById,
      participants: participants.map((id) => ({ id })),
      service: { affiliatedUsers: [] },
    },
  }
}

void test('staff can view every tier, on any status including drafts', () => {
  for (const tier of [CaseVisibility.PUBLIC, CaseVisibility.PARTICIPANTS, CaseVisibility.STAFF]) {
    assert.equal(canViewCaseEvidence(staff, evidence(tier, { status: CaseStatus.DRAFT })), true)
  }
})

void test('anonymous sees only public evidence on a published case', () => {
  assert.equal(canViewCaseEvidence(anon, evidence(CaseVisibility.PUBLIC)), true)
  assert.equal(canViewCaseEvidence(anon, evidence(CaseVisibility.PARTICIPANTS)), false)
  assert.equal(canViewCaseEvidence(anon, evidence(CaseVisibility.STAFF)), false)
})

void test('unpublished cases expose nothing to non-staff, even public evidence', () => {
  for (const status of [CaseStatus.DRAFT, CaseStatus.REJECTED]) {
    assert.equal(canViewCaseEvidence(anon, evidence(CaseVisibility.PUBLIC, { status })), false)
    assert.equal(canViewCaseEvidence(reporter, evidence(CaseVisibility.PUBLIC, { status })), false)
  }
})

void test('a participant sees public and participant tiers but not staff-only', () => {
  assert.equal(canViewCaseEvidence(reporter, evidence(CaseVisibility.PUBLIC)), true)
  assert.equal(canViewCaseEvidence(reporter, evidence(CaseVisibility.PARTICIPANTS)), true)
  assert.equal(canViewCaseEvidence(reporter, evidence(CaseVisibility.STAFF)), false)
})

void test('a logged-in non-participant is treated as public-only', () => {
  assert.equal(canViewCaseEvidence(stranger, evidence(CaseVisibility.PUBLIC)), true)
  assert.equal(canViewCaseEvidence(stranger, evidence(CaseVisibility.PARTICIPANTS)), false)
})

void test('the query filter and the page gate agree on every status', () => {
  for (const status of Object.values(CaseStatus)) {
    assert.equal(
      isCasePublished(status),
      !UNPUBLISHED_CASE_STATUSES.includes(status),
      `${status} disagrees between the Prisma filter and the gate`
    )
  }
})

void test('drafts and rejections stay unpublished', () => {
  assert.equal(isCasePublished(CaseStatus.DRAFT), false)
  assert.equal(isCasePublished(CaseStatus.REJECTED), false)
  assert.equal(isCasePublished(CaseStatus.OPEN), true)
  assert.equal(isCasePublished(CaseStatus.DISPUTED), true)
  assert.equal(isCasePublished(CaseStatus.RESOLVED), true)
})
