import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { CONTACT_MESSAGE_MAX_LENGTH } from '../../actions/contact'
import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { cap, contactCategoriesForUser } from '../../lib/permissions'
import { prisma } from '../../lib/prisma'
import { sendContactChatMessageEvents } from '../../lib/sendChatEvents'

import type { ContactCategory } from '@prisma/client'

const threadId = z.coerce.number().int().positive()

// Either contact capability unlocks the queue route; scoped holders
// (contact:manage-urgent) may only act on the categories they manage.
const contactPermissions = [cap('contact:manage'), cap('contact:manage-urgent')]

// ensureCategoryInScope rejects (as not-found, to avoid leaking existence) when
// the acting user is not allowed to manage the thread's category.
function ensureCategoryInScope(
  user: Parameters<typeof contactCategoriesForUser>[0],
  category: ContactCategory
) {
  const allowed = contactCategoriesForUser(user)
  if (allowed !== 'all' && !allowed.includes(category)) {
    throw new ActionError({ code: 'NOT_FOUND', message: 'Conversation not found' })
  }
}

// Notify the thread author about a thread-level event (seen / resolved), once
// per thread per type. The Notification insert triggers SSE + push delivery.
async function notifyContactThreadAuthor(
  id: number,
  userId: number,
  type: 'CONTACT_SEEN' | 'CONTACT_RESOLVED'
) {
  const exists = await prisma.notification.findFirst({
    where: { userId, type, aboutContactThreadId: id },
    select: { id: true },
  })
  if (exists) return
  await prisma.notification.create({ data: { userId, type, aboutContactThreadId: id } })
}

export const adminContactActions = {
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
        select: { id: true, category: true },
      })
      if (!thread) throw new ActionError({ code: 'NOT_FOUND', message: 'Conversation not found' })
      ensureCategoryInScope(context.locals.user, thread.category)

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
        select: { id: true, category: true, authorId: true, status: true, readAt: true },
      })
      if (!thread) throw new ActionError({ code: 'NOT_FOUND', message: 'Conversation not found' })
      ensureCategoryInScope(context.locals.user, thread.category)

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
