import { without, uniq } from 'lodash-es'

import { prisma } from './prisma'
import { getRedisServerEvents } from './redis/redisServerEvents'

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
    select: { authorId: true },
  })
  if (!thread) throw new Error('Contact thread not found')

  const staffIds = (
    await prisma.user.findMany({
      where: { OR: [{ admin: true }, { capabilities: { has: 'contact:manage' } }] },
      select: { id: true },
    })
  ).map((u) => u.id)

  const recipientIds = without(
    uniq([...(thread.authorId ? [thread.authorId] : []), ...staffIds]),
    senderUserId
  )
  await sendNewChatMessage('contact', threadId, recipientIds)
}
