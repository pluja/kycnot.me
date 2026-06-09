import { without, uniq } from 'lodash-es'

import { prisma } from './prisma'
import { getRedisServerEvents } from './redis/redisServerEvents'

import type { Prisma } from '@prisma/client'

async function sendNewChatMessage(
  conversationType: 'suggestion' | 'contact',
  id: number,
  recipientIds: number[]
) {
  const redisServerEvents = await getRedisServerEvents()
  await Promise.all(
    recipientIds.map((userId) =>
      redisServerEvents.send(userId, 'new-chat-message', { conversationType, id })
    )
  )
}

export async function sendChatMessageEvents(suggestionId: number, senderUserId: number) {
  const suggestion = await prisma.serviceSuggestion.findUnique({
    where: { id: suggestionId },
    select: { userId: true },
  })
  if (!suggestion) throw new Error('Suggestion not found')

  const adminIds = (
    await prisma.user.findMany({
      where: { admin: true },
      select: { id: true },
    })
  ).map((a) => a.id)

  const recipientIds = without(uniq([suggestion.userId, ...adminIds]), senderUserId)
  await sendNewChatMessage('suggestion', suggestionId, recipientIds)
}

export async function sendContactChatMessageEvents(threadId: number, senderUserId: number) {
  const thread = await prisma.contactThread.findUnique({
    where: { id: threadId },
    select: { authorId: true, category: true },
  })
  if (!thread) throw new Error('Contact thread not found')

  // Mirror the notification trigger: urgent reports also reach
  // contact:manage-urgent holders; other categories only full managers.
  const staffWhere: Prisma.UserWhereInput =
    thread.category === 'SERVICE_REPORT_URGENT'
      ? { OR: [{ admin: true }, { capabilities: { hasSome: ['contact:manage', 'contact:manage-urgent'] } }] }
      : { OR: [{ admin: true }, { capabilities: { has: 'contact:manage' } }] }

  const staffIds = (await prisma.user.findMany({ where: staffWhere, select: { id: true } })).map(
    (u) => u.id
  )

  const recipientIds = without(
    uniq([...(thread.authorId ? [thread.authorId] : []), ...staffIds]),
    senderUserId
  )
  await sendNewChatMessage('contact', threadId, recipientIds)
}
