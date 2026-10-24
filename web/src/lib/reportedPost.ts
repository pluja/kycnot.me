import { publicEvidenceSelect } from './experienceQueries'
import { prisma } from './prisma'
import { sendContactChatMessageEvents } from './sendChatEvents'

import type { CommentReportOutcome, Prisma } from '@prisma/client'

export const reportedPostThreadSelect = {
  id: true,
  category: true,
  reportReason: true,
  fromService: true,
  reportOutcome: true,
  reportOutcomeNote: true,
  comment: {
    select: {
      id: true,
      content: true,
      status: true,
      kind: true,
      parentId: true,
      createdAt: true,
      author: { select: { name: true, displayName: true, picture: true } },
      parent: { select: { content: true, author: { select: { name: true, displayName: true } } } },
      service: { select: { name: true, slug: true, serviceVisibility: true } },
      evidence: { select: publicEvidenceSelect },
    },
  },
} satisfies Prisma.ContactThreadSelect

type ReportCloser = Pick<typeof prisma, 'contactMessage' | 'contactThread'>

// closeCommentReport closes a still-open report with an outcome and posts the reply the reporter reads. It returns
// false when the report was already closed, so two moderators acting at once never send two replies.
export async function closeCommentReport(
  tx: ReportCloser,
  {
    threadId,
    staffId,
    outcome,
    note = null,
  }: { threadId: number; staffId: number; outcome: CommentReportOutcome; note?: string | null }
) {
  const now = new Date()
  const { count } = await tx.contactThread.updateMany({
    where: { id: threadId, reportOutcome: null },
    data: {
      reportOutcome: outcome,
      reportOutcomeNote: note,
      status: 'RESOLVED',
      resolvedAt: now,
      readAt: now,
      lastMessageAt: now,
    },
  })
  if (!count) return false
  await tx.contactMessage.create({
    data: {
      threadId,
      fromStaff: true,
      authorId: staffId,
      content:
        outcome === 'ACTION_TAKEN'
          ? 'Thanks for the report. We took action on this comment.'
          : `We reviewed this comment and took no action: ${note ?? ''}`,
    },
  })
  return true
}

// notifyContactThreadAuthor tells the author about a thread event (seen or resolved), once per thread and type. The
// Notification insert is what triggers live and push delivery.
export async function notifyContactThreadAuthor(
  threadId: number,
  userId: number,
  type: 'CONTACT_RESOLVED' | 'CONTACT_SEEN'
) {
  const exists = await prisma.notification.findFirst({
    where: { userId, type, aboutContactThreadId: threadId },
    select: { id: true },
  })
  if (exists) return
  await prisma.notification.create({ data: { userId, type, aboutContactThreadId: threadId } })
}

// announceClosedReports pushes the closing reply into the open chats and notifies each reporter.
export async function announceClosedReports(
  threads: { id: number; authorId: number | null }[],
  staffId: number
) {
  for (const thread of threads) {
    sendContactChatMessageEvents(thread.id, staffId).catch(console.error)
    if (thread.authorId) await notifyContactThreadAuthor(thread.id, thread.authorId, 'CONTACT_RESOLVED')
  }
}
