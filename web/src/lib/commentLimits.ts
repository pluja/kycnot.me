import { z } from 'astro/zod'

// Length limits for posts, reasons, notes and requests, one source for both the form attributes and the schemas.
export const POST_LENGTH = { min: 10, rootMin: 30, max: 2000 }
export const MODERATOR_REASON_LENGTH = { min: 5, max: 500 }
export const PROOF_REQUEST_MESSAGE_LENGTH = { min: 10, max: 500 }
export const REPORT_MESSAGE_LENGTH = { min: 30, max: 4000 }
export const ADMIN_NOTE_MAX_LENGTH = 4000
export const PUBLIC_NOTE_MAX_LENGTH = 2000

export const postContentSchema = z.string().trim().min(POST_LENGTH.min).max(POST_LENGTH.max)
export const moderatorReasonSchema = z
  .string()
  .trim()
  .min(MODERATOR_REASON_LENGTH.min)
  .max(MODERATOR_REASON_LENGTH.max)
