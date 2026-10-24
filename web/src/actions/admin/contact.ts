import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { CONTACT_MESSAGE_MAX_LENGTH } from '../../actions/contact'
import {
  commentReportOutcomesZodEnumByValue,
  getCommentReportOutcomeInfo,
} from '../../constants/commentReports'
import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { conflictedCommentWhere } from '../../lib/experiences'
import { cap, contactCategoriesForUser } from '../../lib/permissions'
import { prisma } from '../../lib/prisma'
import { announceClosedReports, closeCommentReport, notifyContactThreadAuthor } from '../../lib/reportedPost'
import { sendContactChatMessageEvents } from '../../lib/sendChatEvents'

import type { ContactCategory } from '@prisma/client'

const threadId = z.coerce.number().int().positive()

// Either contact capability unlocks the queue route; scoped holders
// (contact:manage-urgent) may only act on the categories they manage.
const contactPermissions = [cap('contact:manage'), cap('contact:manage-urgent')]

// ensureThreadInScope rejects (as not-found, to avoid leaking existence) when the acting user may
// not manage the thread's category, or the thread is about a post they must leave to someone else.
async function ensureThreadInScope(
  user: NonNullable<Parameters<typeof contactCategoriesForUser>[0]> & { id: number; admin: boolean },
  thread: { category: ContactCategory; commentId: number | null }
) {
  const allowed = contactCategoriesForUser(user)
  const conflicted =
    thread.commentId !== null &&
    (await prisma.comment.count({ where: { id: thread.commentId, ...conflictedCommentWhere(user) } })) > 0
  if ((allowed !== 'all' && !allowed.includes(thread.category)) || conflicted) {
    throw new ActionError({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }
}

export const adminContactActions = {
  closeReport: defineProtectedAction({
    accept: 'form',
    permissions: contactPermissions,
    input: z
      .object({
        threadId,
        outcome: commentReportOutcomesZodEnumByValue.refine(
          (outcome) => getCommentReportOutcomeInfo(outcome).moderatorChoice
        ),
        note: z.string().trim().max(300).nullish(),
      })
      .refine((input) => input.outcome !== 'NO_ACTION' || (input.note?.length ?? 0) >= 5, {
        path: ['note'],
        message: 'Tell the reporter briefly why no action was taken.',
      }),
    handler: async (input, context) => {
      const thread = await prisma.contactThread.findUnique({
        where: { id: input.threadId },
        select: { id: true, category: true, commentId: true, authorId: true, reportOutcome: true },
      })
      if (thread?.category !== 'COMMENT_REPORT') {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Report not found' })
      }
      await ensureThreadInScope(context.locals.user, thread)
      if (thread.reportOutcome) throw new ActionError({ code: 'CONFLICT', message: 'This report is closed.' })

      await prisma.$transaction(async (tx) => {
        // A report closed without action ends the service dispute it opened.
        if (input.outcome === 'NO_ACTION' && thread.commentId) {
          await tx.proofRequest.updateMany({
            where: {
              commentId: thread.commentId,
              source: 'SERVICE',
              requestedById: thread.authorId,
              cancelledAt: null,
            },
            data: { cancelledAt: new Date() },
          })
        }
        const closed = await closeCommentReport(tx, {
          threadId: thread.id,
          staffId: context.locals.user.id,
          outcome: input.outcome,
          note: input.outcome === 'NO_ACTION' ? (input.note ?? null) : null,
        })
        if (!closed) throw new ActionError({ code: 'CONFLICT', message: 'This report is closed.' })
      })
      await announceClosedReports([thread], context.locals.user.id)
    },
  }),

  // Staff reply, posted through the shared Chat component (same as the user side).
  message: defineProtectedAction({
    accept: 'form',
    permissions: contactPermissions,
    input: z.object({
      threadId,
      content: z.string().min(1).max(CONTACT_MESSAGE_MAX_LENGTH),
    }),
    handler: async (input, context) => {
      const thread = await prisma.contactThread.findUnique({
        where: { id: input.threadId },
        select: { id: true, category: true, commentId: true, reportOutcome: true },
      })
      if (!thread) throw new ActionError({ code: 'NOT_FOUND', message: 'Conversation not found' })
      await ensureThreadInScope(context.locals.user, thread)
      // A message would reopen the thread while its outcome stays, leaving a closed report stuck in the queue.
      if (thread.reportOutcome) throw new ActionError({ code: 'CONFLICT', message: 'This report is closed.' })

      const now = new Date()
      await prisma.$transaction([
        prisma.contactMessage.create({
          data: {
            threadId: thread.id,
            content: input.content,
            fromStaff: true,
            authorId: context.locals.user.id,
          },
        }),
        prisma.contactThread.update({
          where: { id: thread.id },
          data: { status: 'AWAITING_USER', repliedAt: now, readAt: now, lastMessageAt: now },
        }),
      ])
      sendContactChatMessageEvents(thread.id, context.locals.user.id).catch(console.error)
    },
  }),

  // Moderation actions, posted as plain forms from the thread detail page.
  update: defineProtectedAction({
    accept: 'form',
    permissions: contactPermissions,
    input: z.discriminatedUnion('action', [
      z.object({ threadId, action: z.literal('mark-read') }),
      z.object({ threadId, action: z.literal('mark-unread') }),
      z.object({ threadId, action: z.literal('resolve') }),
      z.object({ threadId, action: z.literal('admin-note'), value: z.string().max(2000).nullish() }),
      z.object({ threadId, action: z.literal('delete') }),
    ]),
    handler: async (input, context) => {
      const thread = await prisma.contactThread.findUnique({
        where: { id: input.threadId },
        select: { id: true, category: true, commentId: true, authorId: true, status: true, readAt: true },
      })
      if (!thread) throw new ActionError({ code: 'NOT_FOUND', message: 'Conversation not found' })
      await ensureThreadInScope(context.locals.user, thread)

      switch (input.action) {
        case 'mark-read':
          await prisma.contactThread.update({ where: { id: thread.id }, data: { readAt: new Date() } })
          // Notify the author the first time staff sees a pending message
          // (skip if already replied/resolved, where it is implied).
          if (thread.authorId && !thread.readAt && thread.status === 'AWAITING_STAFF') {
            await notifyContactThreadAuthor(thread.id, thread.authorId, 'CONTACT_SEEN')
          }
          return
        case 'mark-unread':
          await prisma.contactThread.update({ where: { id: thread.id }, data: { readAt: null } })
          return
        case 'resolve':
          if (thread.category === 'COMMENT_REPORT') {
            throw new ActionError({ code: 'BAD_REQUEST', message: 'Close reports with an outcome.' })
          }
          // Resolving implies the thread was read, so mark it read too.
          await prisma.contactThread.update({
            where: { id: thread.id },
            data: { status: 'RESOLVED', resolvedAt: new Date(), readAt: new Date() },
          })
          if (thread.authorId && thread.status !== 'RESOLVED') {
            await notifyContactThreadAuthor(thread.id, thread.authorId, 'CONTACT_RESOLVED')
          }
          return
        case 'admin-note':
          await prisma.contactThread.update({
            where: { id: thread.id },
            data: { adminNote: input.value && input.value.length > 0 ? input.value : null },
          })
          return
        case 'delete':
          await prisma.contactThread.delete({ where: { id: thread.id } })
          return
      }
    },
  }),
}
