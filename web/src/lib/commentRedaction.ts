import { createHash } from 'node:crypto'

import { z } from 'astro/zod'

import { moderatorReasonSchema, postContentSchema } from './commentLimits'

export const REMOVED_MARKER = '[removed]'
export const FULL_REMOVAL_TEXT = '[Removed by moderation]'

export const commentRedactionInput = z.object({
  commentId: z.coerce.number().int().positive(),
  revisionId: z.coerce.number().int().positive().optional(),
  version: z.coerce.number().int().positive(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  content: postContentSchema,
  reason: moderatorReasonSchema,
})

export function commentContentHash(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

// isValidRedaction accepts only a text whose segments between removal markers
// appear in order in the original, the first at its start and the last at its
// end, or the full removal text. Line endings are compared as LF.
export function isValidRedaction(original: string, redacted: string) {
  const source = original.replaceAll('\r\n', '\n').trim()
  const result = redacted.replaceAll('\r\n', '\n').trim()
  if (result === source) return false
  if (result === FULL_REMOVAL_TEXT) return true
  const [first = '', ...rest] = result.split(REMOVED_MARKER)
  const last = rest.pop()
  if (last === undefined) return false
  if (!source.startsWith(first)) return false
  let position = first.length
  for (const segment of rest) {
    const found = source.indexOf(segment, position)
    if (found === -1) return false
    position = found + segment.length
  }
  return source.length - last.length >= position && source.endsWith(last)
}
