import { ActionError } from 'astro:actions'

import { hasLikelyXss } from './markdown'
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

export const handleXSSDetection = async <T extends Record<string, unknown>>({
  input,
  contentField,
  userId,
  location,
  dontMarkAsSpammer = false,
}: {
  input: T
  contentField: keyof T
  userId: number | null | undefined
  location: string
  dontMarkAsSpammer?: boolean
}) => {
  const content = input[contentField]
  if (content === undefined || content === null) return

  if (typeof content !== 'string') {
    console.error('handleXSSDetection was called incorrectly')
    throw new ActionError({
      message: 'Invalid request',
      code: 'BAD_REQUEST',
    })
  }

  if (hasLikelyXss(content)) {
    if (!dontMarkAsSpammer && !!userId) {
      await prisma.user.update({
        where: {
          id: userId,
          admin: false,
        },
        data: {
          spammer: true,
          internalNotes: {
            create: {
              content: `Marked as spammer because it made a comment with possible XSS attack in: ${location}. Comment:\n\n${content.replaceAll(
                '<',
                '&lt;'
              )}`,
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
}
