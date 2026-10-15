import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { test } from 'node:test'

import {
  CommentKind,
  CommentStatus,
  ExperienceOutcome,
  ExperienceSentiment,
  ServiceUserRole,
} from '@prisma/client'

import { getCommentReplyPreviews } from './commentReplyPreviews'
import { experienceSummary } from './experienceQueries'
import { prisma } from './prisma'

const testDatabaseUrl = process.env.REPLY_PREVIEW_TEST_DATABASE_URL

void test(
  'reply previews prioritize moderators and the service team and enforce publication, service and author boundaries',
  {
    skip: !testDatabaseUrl,
  },
  async () => {
    assert.equal(process.env.DATABASE_URL, testDatabaseUrl)
    const database = new URL(testDatabaseUrl ?? '')
    assert.equal(database.hostname, '127.0.0.1')
    assert.equal(database.port, '55439')
    assert.equal(database.pathname, '/experience_legacy')

    const suffix = randomUUID()
    const serviceIds: number[] = []
    const userIds: number[] = []
    try {
      for (const name of ['main', 'other']) {
        const service = await prisma.service.create({
          data: {
            id: -randomInt(1, 2_000_000_000),
            name: `Reply preview test ${name}`,
            slug: `reply-preview-${name}-${suffix}`,
            description: 'Disposable reply preview test fixture.',
            serviceUrls: [],
          },
          select: { id: true },
        })
        serviceIds.push(service.id)
      }
      for (const name of ['customer', 'owner', 'support', 'unrelated-owner']) {
        const user = await prisma.user.create({
          data: {
            id: -randomInt(1, 2_000_000_000),
            name: `${name}-${suffix}`,
            secretTokenHash: `${name}-${suffix}`,
          },
          select: { id: true },
        })
        userIds.push(user.id)
      }
      const [serviceId, otherServiceId] = serviceIds
      const [customerId, ownerId, supportId, unrelatedOwnerId] = userIds
      assert.ok(serviceId !== undefined)
      assert.ok(otherServiceId !== undefined)
      assert.ok(customerId !== undefined)
      assert.ok(ownerId !== undefined)
      assert.ok(supportId !== undefined)
      assert.ok(unrelatedOwnerId !== undefined)
      await prisma.serviceUser.createMany({
        data: [
          { serviceId, userId: ownerId, role: ServiceUserRole.OWNER },
          { serviceId, userId: supportId, role: ServiceUserRole.SUPPORT },
          { serviceId: otherServiceId, userId: unrelatedOwnerId, role: ServiceUserRole.OWNER },
        ],
      })
      let sequence = 0
      const createComment = async (
        authorId: number,
        parentId: number | null = null,
        status: CommentStatus = CommentStatus.APPROVED,
        commentServiceId = serviceId,
        replyToId: number | null = null
      ) =>
        prisma.comment.create({
          data: {
            authorId,
            parentId,
            replyToId,
            status,
            serviceId: commentServiceId,
            content: `Reply preview fixture message ${sequence.toString()}`,
            createdAt: new Date(Date.UTC(2026, 9, 5, 0, 0, sequence++)),
          },
          select: { id: true },
        })

      const root = await createComment(customerId)
      const firstReply = await createComment(customerId, root.id)
      const ownerReply = await createComment(
        ownerId,
        root.id,
        CommentStatus.APPROVED,
        serviceId,
        firstReply.id
      )
      const supportReply = await createComment(supportId, root.id)
      const latestReply = await createComment(customerId, root.id)
      await createComment(ownerId, root.id, CommentStatus.PENDING)
      await createComment(ownerId, root.id, CommentStatus.REJECTED)
      await createComment(ownerId, root.id, CommentStatus.APPROVED, otherServiceId)

      const group = (await getCommentReplyPreviews([root.id], serviceId)).get(root.id)
      assert.ok(group)
      assert.equal(group.count, 4)
      assert.equal(group.serviceReplied, true)
      assert.equal(group.ownerReplied, true)
      assert.equal(group.staffReplied, false)
      assert.deepEqual(
        group.replies.map((reply) => reply.id),
        [ownerReply.id, supportReply.id]
      )
      assert.ok(group.replies[0]?.author)
      assert.deepEqual(group.replies[0].author.serviceAffiliations, [{ role: ServiceUserRole.OWNER }])

      const restricted = (await getCommentReplyPreviews([root.id], serviceId, customerId)).get(root.id)
      assert.ok(restricted)
      assert.equal(restricted.count, 2)
      assert.equal(restricted.serviceReplied, false)
      assert.equal(restricted.ownerReplied, false)
      assert.deepEqual(
        restricted.replies.map((reply) => reply.id),
        [firstReply.id, latestReply.id]
      )
      assert.equal((await getCommentReplyPreviews([root.id], serviceId, -1)).size, 0)

      const unrelatedRoot = await createComment(customerId)
      const unrelatedReply = await createComment(unrelatedOwnerId, unrelatedRoot.id)
      const unrelated = (await getCommentReplyPreviews([unrelatedRoot.id], serviceId)).get(unrelatedRoot.id)
      assert.ok(unrelated)
      assert.equal(unrelated.count, 1)
      assert.equal(unrelated.serviceReplied, false)
      assert.equal(unrelated.ownerReplied, false)
      assert.ok(unrelated.replies[0]?.author)
      assert.equal(unrelated.replies[0].id, unrelatedReply.id)
      assert.deepEqual(unrelated.replies[0].author.serviceAffiliations, [])

      const emptyRoot = await createComment(customerId)
      const pendingOnlyRoot = await createComment(customerId)
      await createComment(ownerId, pendingOnlyRoot.id, CommentStatus.PENDING)
      const roots = await getCommentReplyPreviews(
        [root.id, unrelatedRoot.id, emptyRoot.id, pendingOnlyRoot.id],
        serviceId
      )
      assert.equal(roots.size, 2)
      assert.equal(roots.has(emptyRoot.id), false)
      assert.equal(roots.has(pendingOnlyRoot.id), false)

      const conversation = await createComment(customerId)
      const older = await createComment(customerId, conversation.id)
      const newer = await createComment(customerId, conversation.id)
      const newest = await createComment(customerId, conversation.id)
      const ordinary = (await getCommentReplyPreviews([conversation.id], serviceId)).get(conversation.id)
      assert.ok(ordinary)
      assert.equal(ordinary.count, 3)
      assert.deepEqual(
        ordinary.replies.map((reply) => reply.id),
        [newer.id, newest.id]
      )
      assert.equal(
        ordinary.replies.some((reply) => reply.id === older.id),
        false
      )
      for (const authorId of [customerId, ownerId]) {
        await prisma.comment.create({
          data: {
            authorId,
            serviceId,
            kind: CommentKind.EXPERIENCE,
            status: CommentStatus.APPROVED,
            content: 'A published experience for testing restricted summary counts.',
            experience: {
              create: { sentiment: ExperienceSentiment.POSITIVE, outcome: ExperienceOutcome.ONGOING },
            },
          },
          select: { id: true },
        })
      }
      const summary = await experienceSummary(serviceId)
      assert.equal(summary.checked.total, 0)
      assert.equal(summary.total, 2)
      const ownSummary = await experienceSummary(serviceId, customerId)
      assert.equal(ownSummary.total, 1)
      assert.equal((await experienceSummary(serviceId, -1)).total, 0)
    } finally {
      await prisma.comment.deleteMany({ where: { serviceId: { in: serviceIds } } })
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } })
      await prisma.user.deleteMany({ where: { id: { in: userIds } } })
      await prisma.$disconnect()
    }
  }
)
