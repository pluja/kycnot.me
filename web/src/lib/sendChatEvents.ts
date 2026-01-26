import { without, uniq } from 'lodash-es'

import { prisma } from './prisma'
import { getRedisServerEvents } from './redis/redisServerEvents'

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

  const redisServerEvents = await getRedisServerEvents()
  await Promise.all(
    recipientIds.map((id) => redisServerEvents.send(id, 'new-chat-message', { suggestionId }))
  )
}
