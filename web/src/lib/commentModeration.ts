import { z } from 'astro/zod'
import { truncate } from 'lodash-es'

import { transformCase } from './strings'

import type { AuditAction, CommentStatus, PrivateProofStatus, RatingMuteReason } from '@prisma/client'

const NOTE_PREVIEW_LENGTH = 200

export const commentModerationInputSchema = z.discriminatedUnion('action', [
  z.object({
    commentId: z.number().int().positive(),
    action: z.literal('status'),
    value: z.enum(['PENDING', 'APPROVED', 'VERIFIED', 'REJECTED']),
  }),
  z.object({
    commentId: z.number().int().positive(),
    action: z.literal('human-action'),
    value: z.enum(['APPROVE', 'REJECT', 'HOLD']),
  }),
  z.object({
    commentId: z.number().int().positive(),
    action: z.literal('rating-mute'),
    value: z.boolean(),
  }),
  z.object({
    commentId: z.number().int().positive(),
    action: z.literal('rating-mute-reason'),
    value: z.enum([
      'AUTHOR_AFFILIATED',
      'AUTHOR_LOW_TRUST',
      'SUSPICIOUS_PATTERN',
      'TEMPLATE_SPAM',
      'CONFLICT_OF_INTEREST',
      'MODERATOR_DISCRETION',
    ]),
  }),
  z.object({
    commentId: z.number().int().positive(),
    action: z.literal('private-proof-status'),
    value: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']),
  }),
  z.object({
    commentId: z.number().int().positive(),
    action: z.enum(['public-note', 'admin-note', 'author-note']),
    value: z.string().max(4000),
  }),
  z.object({
    commentId: z.number().int().positive(),
    action: z.enum(['add-issue', 'remove-issue']),
    value: z.enum(['KYC_REQUESTED', 'FUNDS_BLOCKED']),
  }),
])

type CommentModerationInput = z.infer<typeof commentModerationInputSchema>

type CommentBeforeModeration = {
  status: CommentStatus
  privateProofStatus: PrivateProofStatus | null
  ratingMuteReason: RatingMuteReason | null
}

const words = (value: string) => transformCase(value.replace(/_/g, ' '), 'lower')

const noteLabels = {
  'public-note': 'Public note',
  'admin-note': 'Admin note',
  'author-note': 'Author note',
} as const

const humanActionLabels = {
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  HOLD: 'Held for review',
} as const

export function commentModerationAudit(
  input: CommentModerationInput,
  before: CommentBeforeModeration
): { action: AuditAction; summary: string } {
  switch (input.action) {
    case 'status':
      return {
        action: 'STATUS_CHANGED',
        summary: `Status set to ${words(input.value)}, from ${words(before.status)}`,
      }
    case 'human-action':
      return {
        action: 'STATUS_CHANGED',
        summary: `${humanActionLabels[input.value]}, status was ${words(before.status)}`,
      }
    case 'private-proof-status':
      return {
        action: 'STATUS_CHANGED',
        summary: `Private proof set to ${words(input.value)}, from ${words(before.privateProofStatus ?? 'none')}`,
      }
    case 'rating-mute':
      return { action: 'UPDATED', summary: input.value ? 'Muted the rating' : 'Unmuted the rating' }
    case 'rating-mute-reason':
      return {
        action: 'UPDATED',
        summary: `Rating mute reason set to ${words(input.value)}, from ${words(before.ratingMuteReason ?? 'none')}`,
      }
    case 'public-note':
    case 'admin-note':
    case 'author-note': {
      const note = input.value.trim()
      return {
        action: 'UPDATED',
        summary: note
          ? `${noteLabels[input.action]} set: "${truncate(note, { length: NOTE_PREVIEW_LENGTH })}"`
          : `${noteLabels[input.action]} cleared`,
      }
    }
    case 'add-issue':
      return { action: 'UPDATED', summary: `Flagged issue: ${words(input.value)}` }
    case 'remove-issue':
      return { action: 'UPDATED', summary: `Removed issue: ${words(input.value)}` }
  }
}
