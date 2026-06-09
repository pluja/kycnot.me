import { ContactCategory } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import { formatDistanceStrict } from 'date-fns'

import { captchaFormSchemaProperties, captchaFormSchemaSuperRefine } from '../lib/captchaValidation'
import { canUserSendMessage } from '../lib/contactThread'
import { defineProtectedAction } from '../lib/defineProtectedAction'
import { prisma } from '../lib/prisma'
import { sendContactChatMessageEvents } from '../lib/sendChatEvents'
import { handleHoneypotTrap, handleXSSDetection } from '../lib/spamDetection'

export const CONTACT_MESSAGE_MIN_LENGTH = 80
export const CONTACT_MESSAGE_MAX_LENGTH = 4000
export const CONTACT_MAX_PER_USER_PER_DAY = 3

const CONTACT_MESSAGE_RATE_LIMIT_WINDOW_MINUTES = 1
const MAX_CONTACT_MESSAGES_PER_WINDOW = 5

const dayWindowAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000)

export const contactActions = {
  send: defineProtectedAction({
    accept: 'form',
    permissions: 'not-spammer',
    input: z
      .object({
        category: z.nativeEnum(ContactCategory, {
          errorMap: () => ({ message: 'Pick a category' }),
        }),
        message: z
          .string()
          .min(
            CONTACT_MESSAGE_MIN_LENGTH,
            `Message must be at least ${CONTACT_MESSAGE_MIN_LENGTH} characters. Add enough context that we can act without follow-up.`
          )
          .max(
            CONTACT_MESSAGE_MAX_LENGTH,
            `Message must be at most ${CONTACT_MESSAGE_MAX_LENGTH.toLocaleString()} characters.`
          ),
        // Single required attestation. Checkbox form inputs send "on"
        // when checked and are omitted entirely when unchecked, so we
        // treat anything other than the literal "on" as a refusal.
        confirmRules: z.literal('on', {
          errorMap: () => ({ message: 'You must confirm you have read the rules above.' }),
        }),
        // Honeypot. Real users never see this field. Bots fill everything.
        website: z.string().max(0).optional(),
        ...captchaFormSchemaProperties,
      })
      .superRefine(captchaFormSchemaSuperRefine),
    handler: async (input, context) => {
      const user = context.locals.user

      await handleHoneypotTrap({
        input,
        honeyPotTrapField: 'website',
        userId: user.id,
        location: 'contact.send',
      })

      await handleXSSDetection({
        input,
        contentField: 'message',
        userId: user.id,
        location: 'contact.send',
      })

      // One open conversation at a time, plus a rolling 24h cap on new ones.
      // The single-open-thread rule is the anti-flood mechanism: a user cannot
      // start another conversation until the current one is resolved. Per-IP
      // throttling is intentionally not done here (the edge handles DoS, and
      // storing IP-derived data would add a privacy footprint we don't want).
      const [openThreads, perDayCount] = await Promise.all([
        prisma.contactThread.count({
          where: { authorId: user.id, status: { not: 'RESOLVED' } },
        }),
        prisma.contactThread.count({
          where: { authorId: user.id, createdAt: { gte: dayWindowAgo() } },
        }),
      ])

      if (openThreads > 0) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message:
            'You already have an open conversation. Continue it instead of starting a new one; you can open another once it is resolved.',
        })
      }
      if (perDayCount >= CONTACT_MAX_PER_USER_PER_DAY) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: `You can start up to ${CONTACT_MAX_PER_USER_PER_DAY.toLocaleString()} conversations per day.`,
        })
      }

      const thread = await prisma.contactThread.create({
        data: {
          category: input.category,
          authorId: user.id,
          status: 'AWAITING_STAFF',
          messages: {
            create: { content: input.message, fromStaff: false, authorId: user.id },
          },
        },
        select: { id: true },
      })

      sendContactChatMessageEvents(thread.id, user.id).catch(console.error)

      return { threadId: thread.id }
    },
  }),

  message: defineProtectedAction({
    accept: 'form',
    permissions: 'not-spammer',
    input: z.object({
      threadId: z.coerce.number().int().positive(),
      content: z.string().min(1).max(CONTACT_MESSAGE_MAX_LENGTH),
    }),
    handler: async (input, context) => {
      const user = context.locals.user

      const thread = await prisma.contactThread.findUnique({
        where: { id: input.threadId },
        select: { id: true, authorId: true, status: true },
      })

      if (!thread || thread.authorId !== user.id) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Conversation not found' })
      }
      if (thread.status === 'RESOLVED') {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'This conversation is resolved. Start a new one if you still need help.',
        })
      }

      // Turn-gate (admins exempt): cap consecutive messages with no staff reply
      // in between, so a thread cannot be flooded with follow-up nagging.
      if (!user.admin) {
        const lastStaff = await prisma.contactMessage.findFirst({
          where: { threadId: thread.id, fromStaff: true },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })
        const unansweredUserMessages = await prisma.contactMessage.count({
          where: {
            threadId: thread.id,
            fromStaff: false,
            ...(lastStaff ? { createdAt: { gt: lastStaff.createdAt } } : {}),
          },
        })
        if (!canUserSendMessage({ status: thread.status, unansweredUserMessages })) {
          throw new ActionError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Please wait for the team to reply before sending more messages.',
          })
        }
      }

      // Rate limit (admins exempt), mirroring the suggestion chat.
      if (!user.admin) {
        const windowStart = new Date(
          Date.now() - CONTACT_MESSAGE_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000
        )
        const recentMessages = await prisma.contactMessage.findMany({
          where: { authorId: user.id, fromStaff: false, createdAt: { gte: windowStart } },
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
        if (recentMessages.length >= MAX_CONTACT_MESSAGES_PER_WINDOW) {
          const oldest = recentMessages[0]
          const timeToWait = oldest
            ? formatDistanceStrict(oldest.createdAt, windowStart)
            : '1 minute'
          throw new ActionError({
            code: 'TOO_MANY_REQUESTS',
            message: `Rate limit exceeded. Please wait ${timeToWait} before sending another message.`,
          })
        }
      }

      await prisma.$transaction([
        prisma.contactMessage.create({
          data: { threadId: thread.id, content: input.content, fromStaff: false, authorId: user.id },
        }),
        prisma.contactThread.update({
          where: { id: thread.id },
          data: { status: 'AWAITING_STAFF', readAt: null, lastMessageAt: new Date() },
        }),
      ])

      sendContactChatMessageEvents(thread.id, user.id).catch(console.error)
    },
  }),
}
