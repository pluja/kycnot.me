import { ActionError } from 'astro:actions'

import { prisma } from './prisma'

export const handleHoneypotTrap = async <T extends Record<string, unknown>>({
  input,
  honeyPotTrapField,
  userId,
  location,
  dontMarkAsSpammer = false,
}: {
  input: T
  honeyPotTrapField: keyof T
  userId: number | null | undefined
  location: string
  dontMarkAsSpammer?: boolean
}) => {
  if (!input[honeyPotTrapField]) return

  if (!dontMarkAsSpammer && !!userId) {
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        spammer: true,
        internalNotes: {
          create: {
            content: `Marked as spammer because it fell for the honey pot trap in: ${location}`,
          },
        },
      },
    })
  }

  throw new ActionError({
    message: 'Invalid request',
    code: 'BAD_REQUEST',
  })
}
