import { CommentStatus, EvidenceFinding } from '@prisma/client'
import { z } from 'astro/zod'

import { commentRulesZodEnumByValue, getCommentRuleInfo } from '../constants/commentRules'
import { checkText } from '../constants/evidenceCheckTexts'

import { MODERATOR_REASON_LENGTH, PUBLIC_NOTE_MAX_LENGTH } from './commentLimits'
import { formCheckbox } from './zodUtils'

// optionalText is empty-or-long-enough: an empty field falls back to the standard wording.
const optionalText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => value === '' || value.length >= min,
      `Write at least ${String(min)} characters, or leave it empty.`
    )
    .nullish()
    .transform((value) => value || undefined)

export const publicationInput = z
  .object({
    commentId: z.coerce.number().int().positive(),
    status: z.enum([CommentStatus.APPROVED, CommentStatus.REJECTED, CommentStatus.PENDING]),
    decisionReason: commentRulesZodEnumByValue.or(z.literal('')).nullish(),
    reason: z
      .string()
      .nullish()
      .transform((value) => value?.trim() ?? ''),
    publicNote: z.string().trim().max(PUBLIC_NOTE_MAX_LENGTH).optional(),
    // seenStatus and seenDecidedAt are the post as the moderator saw it, so a decision taken meanwhile by someone
    // else is not silently replaced.
    seenStatus: z.nativeEnum(CommentStatus).optional(),
    seenDecidedAt: z.string().optional(),
  })
  .transform((input) =>
    input.status === 'APPROVED' ? { ...input, reason: '', decisionReason: undefined } : input
  )
  .superRefine((input, context) => {
    if (input.reason.length > MODERATOR_REASON_LENGTH.max) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: `Keep the reason under ${String(MODERATOR_REASON_LENGTH.max)} characters.`,
      })
    }
    const decisionReason = input.decisionReason || undefined
    const appliesTo = decisionReason ? getCommentRuleInfo(decisionReason).appliesTo : 'both'
    if (
      (input.status === 'REJECTED' && appliesTo === 'hold') ||
      (input.status === 'PENDING' && appliesTo === 'reject')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['decisionReason'],
        message:
          input.status === 'REJECTED'
            ? 'That reason is for holding a comment.'
            : 'That reason is for rejecting a comment.',
      })
    }
    const needsDetails =
      input.status !== 'APPROVED' && (!decisionReason || getCommentRuleInfo(decisionReason).requiresDetails)
    if ((needsDetails || input.reason.length > 0) && input.reason.length < MODERATOR_REASON_LENGTH.min) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: `Add at least ${String(MODERATOR_REASON_LENGTH.min)} characters of detail.`,
      })
    }
  })

export const evidenceCheckInput = z
  .object({
    evidenceId: z.coerce.number().int().positive(),
    finding: z
      .nativeEnum(EvidenceFinding)
      .refine((value): value is Exclude<EvidenceFinding, 'LEGACY'> => value !== EvidenceFinding.LEGACY),
    explanation: optionalText(10, 500),
    orderLookupConfirmed: formCheckbox,
  })
  .superRefine((input, context) => {
    const needsLookup =
      input.finding === EvidenceFinding.ORDER_FOUND || input.finding === EvidenceFinding.ORDER_NOT_FOUND
    if (needsLookup && !input.orderLookupConfirmed) {
      context.addIssue({
        code: 'custom',
        path: ['orderLookupConfirmed'],
        message:
          'Confirm that the lookup distinguishes a valid order from an invalid reference, or choose “Could not check”.',
      })
    }
  })
  .transform((input) => ({
    ...input,
    explanation: checkText(input.finding, input.explanation),
  }))
