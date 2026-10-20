import { ActionError } from 'astro:actions'

import { recordAuditLog } from './auditLog'
import { publicEvidenceSelect } from './experienceQueries'
import { conflictedCommentWhere } from './experiences'
import { isHeldOnlyForProof, summarizeProof } from './proofEvidence'

import type { prisma } from './prisma'

export async function checkExperienceModerator(
  tx: Pick<typeof prisma, 'comment' | 'user'>,
  moderatorId: number,
  commentId: number
) {
  const comment = await tx.comment.findUnique({
    where: { id: commentId },
    select: { id: true, serviceId: true, authorId: true, version: true, status: true },
  })
  if (!comment) throw new ActionError({ code: 'NOT_FOUND' })
  const moderator = await tx.user.findUniqueOrThrow({
    where: { id: moderatorId },
    select: { id: true, admin: true },
  })
  if (await tx.comment.count({ where: { id: commentId, ...conflictedCommentWhere(moderator) } })) {
    throw new ActionError({ code: 'FORBIDDEN', message: 'Another moderator must review this comment.' })
  }
  return comment
}

// publishIfHeldOnlyForProof publishes a post the AI held only for its proof, once the post has accepted proof and
// no other proof still waits for a check. Accepting proof and clearing the last note can both complete that.
export async function publishIfHeldOnlyForProof(
  tx: Pick<typeof prisma, 'auditLog' | 'comment'>,
  commentId: number,
  moderatorId: number
) {
  const post = await tx.comment.findUniqueOrThrow({
    where: { id: commentId },
    select: {
      status: true,
      humanAction: true,
      aiAction: true,
      aiSignals: true,
      evidence: { select: publicEvidenceSelect },
    },
  })
  const proofsStillWaiting = post.evidence.filter((item) => item.needsCheck && !item.removedAt).length
  if (summarizeProof(post.evidence) !== 'checked' || !isHeldOnlyForProof(post, proofsStillWaiting)) {
    return false
  }
  await tx.comment.update({
    where: { id: commentId },
    data: {
      status: 'APPROVED',
      humanAction: 'APPROVE',
      humanReasoning: 'Published after the proof check.',
      humanDecidedAt: new Date(),
      humanDecidedById: moderatorId,
    },
  })
  await recordAuditLog(tx, {
    actorId: moderatorId,
    action: 'STATUS_CHANGED',
    targetType: 'COMMENT',
    targetId: commentId,
    summary: 'APPROVED: the proof check was the only hold',
  })
  return true
}
