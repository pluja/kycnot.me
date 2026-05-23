import { ContactCategory } from '@prisma/client'
import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'

import { captchaFormSchemaProperties, captchaFormSchemaSuperRefine } from '../lib/captchaValidation'
import { defineProtectedAction } from '../lib/defineProtectedAction'
import { prisma } from '../lib/prisma'
import { handleHoneypotTrap, handleXSSDetection } from '../lib/spamDetection'

export const CONTACT_MESSAGE_MIN_LENGTH = 80
export const CONTACT_MESSAGE_MAX_LENGTH = 4000
export const CONTACT_MAX_PER_USER_PER_DAY = 3

// Stricter than RFC 5321 by design: forbids mailto: query separators
// (?, &, =) and other URL specials so the admin queue's `mailto:` link
// can't be turned into a pre-filled subject/body payload by a submitter.
const SAFE_EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

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
        // Astro's form parser sends `null` for empty optional inputs (not ''),
        // so `.nullish()` is required to accept blanks. Normalize to either
        // undefined or a trimmed non-empty string before validating.
        replyEmail: z
          .string()
          .nullish()
          .transform((v) => {
            if (!v) return undefined
            const trimmed = v.trim()
            return trimmed.length > 0 ? trimmed : undefined
          })
          .refine(
            (v) => v === undefined || (v.length <= 200 && SAFE_EMAIL_RE.test(v)),
            'Reply address must be a valid email or left empty'
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

      // Per-user rolling 24h cap. Pre-existing open messages also block:
      // one outstanding message at a time so the queue doesn't accumulate
      // multiple threads from the same person. Per-IP throttling is
      // intentionally not done here; the edge (Caddy) handles DoS at the
      // network layer, and storing IP-derived data per message would add
      // a privacy footprint we don't want.
      const since = dayWindowAgo()
      const [perUserCount, openMessages] = await Promise.all([
        prisma.contactMessage.count({
          where: { authorId: user.id, createdAt: { gte: since } },
        }),
        prisma.contactMessage.count({
          where: { authorId: user.id, readAt: null },
        }),
      ])

      if (openMessages > 0) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message:
            'You already have a message waiting to be read. Please wait for a reply (or for the moderator to mark it read) before sending another.',
        })
      }
      if (perUserCount >= CONTACT_MAX_PER_USER_PER_DAY) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: `You can send up to ${CONTACT_MAX_PER_USER_PER_DAY.toLocaleString()} messages per day.`,
        })
      }

      await prisma.contactMessage.create({
        data: {
          category: input.category,
          message: input.message,
          replyEmail: input.replyEmail ?? null,
          authorId: user.id,
        },
        select: { id: true },
      })
    },
  }),
}
