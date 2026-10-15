import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { EvidenceFinding, type PrivateProofStatus } from '@prisma/client'

import { userTrustRows } from './dbFunctions'
import { experienceSummary, filterExperienceIds } from './experienceQueries'
import { prisma } from './prisma'
import { countsAsProof } from './proofEvidence'

const testDatabaseUrl = process.env.EXPERIENCE_QUERIES_TEST_DATABASE_URL

type Case = {
  name: string
  // findings are recorded oldest first, so the last one decides.
  findings: EvidenceFinding[]
  legacyStatus?: PrivateProofStatus
  removed?: boolean
}

const cases: Case[] = [
  { name: 'unchecked', findings: [] },
  ...Object.values(EvidenceFinding)
    .filter((finding) => finding !== 'LEGACY')
    .map((finding) => ({ name: finding, findings: [finding] })),
  { name: 'legacy approved', findings: ['LEGACY'], legacyStatus: 'APPROVED' },
  { name: 'legacy rejected', findings: ['LEGACY'], legacyStatus: 'REJECTED' },
  { name: 'found, then inconsistent', findings: ['ORDER_FOUND', 'INCONSISTENT'] },
  { name: 'inconsistent, then found', findings: ['INCONSISTENT', 'ORDER_FOUND'] },
  { name: 'removed', findings: ['ORDER_FOUND'], removed: true },
]

void test(
  'the summary and the proof filter count exactly what proofStatus counts',
  { skip: !testDatabaseUrl },
  async () => {
    assert.equal(process.env.DATABASE_URL, testDatabaseUrl)
    const suffix = randomUUID()
    const service = await prisma.service.create({
      data: {
        id: -randomInt(1, 2_000_000_000),
        name: 'Proof rule test',
        slug: `proof-rule-${suffix}`,
        description: 'Disposable proof rule fixture.',
        serviceUrls: [],
      },
      select: { id: true },
    })
    const authorIds: number[] = []
    try {
      const expected = new Map<number, boolean>()
      const authorOfPost = new Map<number, number>()
      for (const [index, item] of cases.entries()) {
        const author = await prisma.user.create({
          data: {
            id: -randomInt(1, 2_000_000_000),
            name: `proof-${suffix}-${index.toString()}`,
            secretTokenHash: `proof-${suffix}-${index.toString()}`,
          },
          select: { id: true },
        })
        authorIds.push(author.id)
        const post = await prisma.comment.create({
          data: {
            authorId: author.id,
            serviceId: service.id,
            status: 'APPROVED',
            kind: 'EXPERIENCE',
            content: `Proof rule fixture: ${item.name}.`,
            experience: { create: { sentiment: 'POSITIVE' } },
          },
          select: { id: true },
        })
        const evidence = await prisma.commentEvidence.create({
          data: {
            commentId: post.id,
            authorId: author.id,
            body: 'ABC123',
            kind: 'ORDER_ID',
            legacyStatus: item.legacyStatus,
            removedAt: item.removed ? new Date() : null,
          },
          select: { id: true },
        })
        for (const [index, finding] of item.findings.entries()) {
          await prisma.evidenceCheck.create({
            data: {
              evidenceId: evidence.id,
              finding,
              explanation: 'Fixture.',
              recordedAt: new Date(Date.now() - (item.findings.length - index) * 60_000),
            },
          })
        }
        authorOfPost.set(post.id, author.id)
        expected.set(
          post.id,
          countsAsProof({
            removedAt: item.removed ? new Date() : null,
            legacyStatus: item.legacyStatus ?? null,
            checks: item.findings.slice(-1).map((finding) => ({ finding })),
          })
        )
      }
      const counted = [...expected.values()].filter(Boolean).length
      const summary = await experienceSummary(service.id)
      assert.equal(summary.checked.total, counted)
      assert.equal(summary.total, cases.length)
      const checked = new Set(
        (await filterExperienceIds(service.id, { proof: 'checked' })).map((row) => row.id)
      )
      const unproven = new Set(
        (await filterExperienceIds(service.id, { proof: 'unproven' })).map((row) => row.id)
      )
      // Each fixture author has one published post, so the trust function counts one checked post or none.
      const trust = new Map(
        (await userTrustRows(prisma, authorIds)).map((row) => [row.userId, row.checkedProofPosts])
      )
      for (const [postId, counts] of expected) {
        assert.equal(checked.has(postId), counts, `checked filter for post ${postId.toString()}`)
        assert.equal(unproven.has(postId), !counts, `unproven filter for post ${postId.toString()}`)
        assert.equal(
          trust.get(authorOfPost.get(postId) ?? 0),
          counts ? 1 : 0,
          `trust for post ${postId.toString()}`
        )
      }
    } finally {
      await prisma.evidenceCheck.deleteMany({ where: { evidence: { comment: { serviceId: service.id } } } })
      await prisma.commentEvidence.deleteMany({ where: { comment: { serviceId: service.id } } })
      await prisma.comment.deleteMany({ where: { serviceId: service.id } })
      await prisma.service.delete({ where: { id: service.id } })
      await prisma.user.deleteMany({ where: { id: { in: authorIds } } })
      await prisma.$disconnect()
    }
  }
)

void test(
  'the problem filter matches tagged posts that are not resolved',
  { skip: !testDatabaseUrl },
  async () => {
    assert.equal(process.env.DATABASE_URL, testDatabaseUrl)
    const suffix = randomUUID()
    const service = await prisma.service.create({
      data: {
        id: -randomInt(1, 2_000_000_000),
        name: 'Problem rule test',
        slug: `problem-rule-${suffix}`,
        description: 'Disposable problem rule fixture.',
        serviceUrls: [],
      },
      select: { id: true },
    })
    const author = await prisma.user.create({
      data: {
        id: -randomInt(1, 2_000_000_000),
        name: `problem-${suffix}`,
        secretTokenHash: `problem-${suffix}`,
      },
      select: { id: true },
    })
    try {
      const posts = [
        { issues: ['FUNDS_BLOCKED'], outcome: 'UNSPECIFIED' },
        { issues: ['FUNDS_BLOCKED'], outcome: 'RESOLVED' },
        { issues: ['KYC_REQUESTED'], outcome: 'ONGOING' },
        { issues: [], outcome: 'NO_ISSUE' },
      ] as const
      const ids = []
      for (const [index, post] of posts.entries()) {
        const created = await prisma.comment.create({
          data: {
            authorId: author.id,
            serviceId: service.id,
            status: 'APPROVED',
            kind: 'EXPERIENCE',
            issues: [...post.issues],
            content: `Problem rule fixture ${String(index)}.`,
            experience: { create: { sentiment: 'NEGATIVE', outcome: post.outcome } },
          },
          select: { id: true },
        })
        ids.push(created.id)
      }
      const matching = async (problem: 'any' | 'FUNDS_BLOCKED') =>
        (await filterExperienceIds(service.id, { problem, recent: true })).map((row) => row.id).sort()
      assert.deepEqual(await matching('any'), [ids[0], ids[2]].sort())
      assert.deepEqual(await matching('FUNDS_BLOCKED'), [ids[0]])
    } finally {
      await prisma.comment.deleteMany({ where: { serviceId: service.id } })
      await prisma.service.delete({ where: { id: service.id } })
      await prisma.user.delete({ where: { id: author.id } })
      await prisma.$disconnect()
    }
  }
)

void test(
  "a new account's first unproven post counts half in the weighted summary",
  { skip: !testDatabaseUrl },
  async () => {
    assert.equal(process.env.DATABASE_URL, testDatabaseUrl)
    const suffix = randomUUID()
    const service = await prisma.service.create({
      data: {
        id: -randomInt(1, 2_000_000_000),
        name: 'Newcomer weight test',
        slug: `newcomer-${suffix}`,
        description: 'Disposable newcomer weight fixture.',
        serviceUrls: [],
      },
      select: { id: true },
    })
    const newcomer = await prisma.user.create({
      data: { id: -randomInt(1, 2_000_000_000), name: `new-${suffix}`, secretTokenHash: `new-${suffix}` },
      select: { id: true },
    })
    const regular = await prisma.user.create({
      data: {
        id: -randomInt(1, 2_000_000_000),
        name: `old-${suffix}`,
        secretTokenHash: `old-${suffix}`,
        createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    })
    try {
      for (const authorId of [newcomer.id, regular.id]) {
        await prisma.comment.create({
          data: {
            authorId,
            serviceId: service.id,
            status: 'APPROVED',
            kind: 'EXPERIENCE',
            content: 'Newcomer weight fixture post.',
            experience: { create: { sentiment: 'NEGATIVE' } },
          },
        })
      }
      const summary = await experienceSummary(service.id)
      assert.equal(summary.all.negative, 2)
      assert.equal(summary.weighted.negative, 1.5)
    } finally {
      await prisma.comment.deleteMany({ where: { serviceId: service.id } })
      await prisma.service.delete({ where: { id: service.id } })
      await prisma.user.deleteMany({ where: { id: { in: [newcomer.id, regular.id] } } })
      await prisma.$disconnect()
    }
  }
)

void test(
  'an unanswered proof request past its due date takes a post out of the summary',
  { skip: !testDatabaseUrl },
  async () => {
    assert.equal(process.env.DATABASE_URL, testDatabaseUrl)
    const suffix = randomUUID()
    const service = await prisma.service.create({
      data: {
        id: -randomInt(1, 2_000_000_000),
        name: 'Unproven test',
        slug: `unproven-${suffix}`,
        description: 'Disposable unproven fixture.',
        serviceUrls: [],
      },
      select: { id: true },
    })
    const author = await prisma.user.create({
      data: {
        id: -randomInt(1, 2_000_000_000),
        name: `unproven-${suffix}`,
        secretTokenHash: `unproven-${suffix}`,
      },
      select: { id: true },
    })
    try {
      const post = await prisma.comment.create({
        data: {
          authorId: author.id,
          serviceId: service.id,
          status: 'APPROVED',
          kind: 'EXPERIENCE',
          content: 'Unproven fixture post.',
          experience: { create: { sentiment: 'NEGATIVE' } },
        },
        select: { id: true },
      })
      const request = await prisma.proofRequest.create({
        data: { commentId: post.id, source: 'SERVICE', dueAt: new Date(Date.now() + 60_000) },
        select: { id: true },
      })
      assert.equal((await experienceSummary(service.id)).total, 1)
      await prisma.proofRequest.update({
        where: { id: request.id },
        data: { dueAt: new Date(Date.now() - 60_000) },
      })
      assert.equal((await experienceSummary(service.id)).total, 0)
      const lateProof = await prisma.commentEvidence.create({
        data: { commentId: post.id, authorId: author.id, body: 'ORDER123' },
        select: { id: true },
      })
      assert.equal((await experienceSummary(service.id)).total, 0)
      await prisma.commentEvidence.update({
        where: { id: lateProof.id },
        data: { createdAt: new Date(Date.now() - 120_000) },
      })
      assert.equal((await experienceSummary(service.id)).total, 1)
    } finally {
      await prisma.comment.deleteMany({ where: { serviceId: service.id } })
      await prisma.service.delete({ where: { id: service.id } })
      await prisma.user.delete({ where: { id: author.id } })
      await prisma.$disconnect()
    }
  }
)

void test(
  'only the latest post of each author counts in the summary',
  { skip: !testDatabaseUrl },
  async () => {
    assert.equal(process.env.DATABASE_URL, testDatabaseUrl)
    const suffix = randomUUID()
    const service = await prisma.service.create({
      data: {
        id: -randomInt(1, 2_000_000_000),
        name: 'Repeat author test',
        slug: `repeat-${suffix}`,
        description: 'Disposable repeat author fixture.',
        serviceUrls: [],
      },
      select: { id: true },
    })
    const author = await prisma.user.create({
      data: {
        id: -randomInt(1, 2_000_000_000),
        name: `repeat-${suffix}`,
        secretTokenHash: `repeat-${suffix}`,
      },
      select: { id: true },
    })
    try {
      const postIds: number[] = []
      for (const sentiment of ['POSITIVE', 'POSITIVE', 'NEGATIVE'] as const) {
        const post = await prisma.comment.create({
          data: {
            authorId: author.id,
            serviceId: service.id,
            status: 'APPROVED',
            kind: 'EXPERIENCE',
            content: 'Repeat author fixture post.',
            experience: { create: { sentiment } },
          },
          select: { id: true },
        })
        postIds.push(post.id)
      }
      const summary = await experienceSummary(service.id)
      assert.equal(summary.total, 1)
      assert.deepEqual(summary.all, { positive: 0, neutral: 0, negative: 1 })
      // An Unproven latest post must not hide the author's earlier one.
      await prisma.proofRequest.create({
        data: { commentId: postIds[2] ?? 0, source: 'SERVICE', dueAt: new Date(Date.now() - 60_000) },
      })
      assert.deepEqual((await experienceSummary(service.id)).all, { positive: 1, neutral: 0, negative: 0 })
    } finally {
      await prisma.comment.deleteMany({ where: { serviceId: service.id } })
      await prisma.service.delete({ where: { id: service.id } })
      await prisma.user.delete({ where: { id: author.id } })
      await prisma.$disconnect()
    }
  }
)
