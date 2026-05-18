import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import { commentStatusById } from './commentStatus'

import type { TailwindColor } from '../lib/colors'
import type { Prisma } from '@prisma/client'

type CommentStatusFilterInfo<T extends string | null | undefined = string> = {
  value: T
  label: string
  color: TailwindColor
  icon: string
  whereClause: Prisma.CommentWhereInput
  classNames: {
    filter: string
  }
}

export const {
  dataArray: commentStatusFilters,
  dataObject: commentStatusFiltersById,
  getFn: getCommentStatusFilterInfo,
  zodEnumById: commentStatusFiltersZodEnum,
} = makeHelpersForOptions(
  'value',
  (value): CommentStatusFilterInfo<typeof value> => ({
    value,
    label: value ? transformCase(value, 'title') : String(value),
    whereClause: {},
    color: 'gray',
    icon: 'ri:question-line',
    classNames: {
      filter: 'border-zinc-700 transition-colors hover:border-green-500/50',
    },
  }),
  [
    {
      label: 'All',
      value: 'all',
      whereClause: {},
      color: 'gray',
      icon: 'ri:question-line',
      classNames: {
        filter: 'border-green-500 bg-green-500/20 text-green-400',
      },
    },
    {
      label: 'Mod Work',
      value: 'mod-work',
      color: 'yellow',
      icon: 'ri:shield-user-line',
      // The primary moderator queue: fresh AI handoffs plus mod-deferred items.
      // Pinned to status=PENDING so any code path that flips status without
      // setting humanAction (e.g. proof-status side-channels) can't leave a
      // finished row stuck in the queue.
      whereClause: {
        status: 'PENDING',
        OR: [{ aiAction: 'HOLD', humanAction: null }, { humanAction: 'HOLD' }],
      },
      classNames: { filter: 'border-yellow-500 bg-yellow-500/20 text-yellow-400' },
    },
    {
      value: 'pending',
      label: 'Pending',
      color: commentStatusById.PENDING.color,
      icon: 'ri:robot-2-line',
      whereClause: {
        status: 'PENDING',
      },
      classNames: {
        filter: 'border-blue-500 bg-blue-500/20 text-blue-400',
      },
    },
    {
      value: 'rejected',
      label: commentStatusById.REJECTED.label,
      color: commentStatusById.REJECTED.color,
      icon: commentStatusById.REJECTED.icon,
      whereClause: {
        status: 'REJECTED',
      },
      classNames: {
        filter: 'border-red-500 bg-red-500/20 text-red-400',
      },
    },
    {
      label: 'Suspicious',
      value: 'suspicious',
      color: 'red',
      icon: 'ri:close-circle-fill',
      whereClause: {
        ratingMuted: true,
        ratingMuteReason: { in: ['SUSPICIOUS_PATTERN', 'TEMPLATE_SPAM'] },
      },
      classNames: {
        filter: 'border-red-500 bg-red-500/20 text-red-400',
      },
    },
    {
      value: 'verified',
      label: commentStatusById.VERIFIED.label,
      color: commentStatusById.VERIFIED.color,
      icon: commentStatusById.VERIFIED.icon,
      whereClause: {
        status: 'VERIFIED',
      },
      classNames: {
        filter: 'border-blue-500 bg-blue-500/20 text-blue-400',
      },
    },
    {
      value: 'approved',
      label: commentStatusById.APPROVED.label,
      color: commentStatusById.APPROVED.color,
      icon: commentStatusById.APPROVED.icon,
      whereClause: {
        status: 'APPROVED',
      },
      classNames: {
        filter: 'border-green-500 bg-green-500/20 text-green-400',
      },
    },
    {
      label: 'On Hold',
      value: 'on-hold',
      color: 'yellow',
      icon: 'ri:pause-circle-fill',
      // A human moderator already pressed Hold to defer the comment.
      whereClause: { humanAction: 'HOLD' },
      classNames: { filter: 'border-yellow-500 bg-yellow-500/20 text-yellow-400' },
    },
    {
      label: 'Needs Human',
      value: 'needs-human',
      color: 'yellow',
      icon: 'ri:user-search-line',
      // AI said hold AND no human has acted yet. The moderator's active work
      // queue: drops out the moment a mod approves/rejects/holds.
      whereClause: { aiAction: 'HOLD', humanAction: null },
      classNames: { filter: 'border-yellow-500 bg-yellow-500/20 text-yellow-400' },
    },
    {
      label: 'AI: Reject',
      value: 'ai-reject',
      color: 'red',
      icon: 'ri:close-circle-line',
      whereClause: { aiAction: 'REJECT' },
      classNames: { filter: 'border-red-500 bg-red-500/20 text-red-400' },
    },
    {
      label: 'Unmoderated by AI',
      value: 'unmoderated-by-ai',
      color: 'gray',
      icon: 'ri:robot-2-line',
      // AI hasn't analyzed this comment yet. Pyworker runs hourly, so this
      // should drain naturally; useful for catching worker outages.
      whereClause: { aiAction: null, status: 'PENDING' },
      classNames: { filter: 'border-zinc-500 bg-zinc-500/20 text-zinc-300' },
    },
    {
      label: 'AI auto-decided',
      value: 'ai-auto-decided',
      color: 'cyan',
      icon: 'ri:robot-2-fill',
      // AI made a final decision (APPROVE or REJECT) and no human ever
      // overrode. The audit pile for fully automated decisions.
      whereClause: { aiAction: { in: ['APPROVE', 'REJECT'] }, humanAction: null },
      classNames: { filter: 'border-cyan-500 bg-cyan-500/20 text-cyan-400' },
    },
    {
      label: 'Brigade',
      value: 'brigade',
      color: 'orange',
      icon: 'ri:group-line',
      whereClause: { aiIsBrigade: true },
      classNames: { filter: 'border-orange-500 bg-orange-500/20 text-orange-400' },
    },
    {
      label: 'Has proof',
      value: 'has-proof',
      color: 'purple',
      icon: 'ri:key-2-line',
      whereClause: { privateProof: { not: null } },
      classNames: { filter: 'border-purple-500 bg-purple-500/20 text-purple-400' },
    },
    {
      label: 'Proof pending',
      value: 'proof-pending',
      color: 'purple',
      icon: 'ri:key-2-line',
      whereClause: { privateProof: { not: null }, privateProofStatus: 'PENDING' },
      classNames: { filter: 'border-purple-500 bg-purple-500/20 text-purple-400' },
    },
    {
      label: 'Issue: KYC',
      value: 'issue-kyc',
      color: 'red',
      icon: 'ri:bank-card-line',
      whereClause: { issues: { has: 'KYC_REQUESTED' } },
      classNames: { filter: 'border-red-500 bg-red-500/20 text-red-400' },
    },
    {
      label: 'Issue: Funds blocked',
      value: 'issue-funds',
      color: 'red',
      icon: 'ri:lock-line',
      whereClause: { issues: { has: 'FUNDS_BLOCKED' } },
      classNames: { filter: 'border-red-500 bg-red-500/20 text-red-400' },
    },
    {
      label: 'Rating muted',
      value: 'rating-muted',
      color: 'orange',
      icon: 'ri:star-off-line',
      whereClause: { ratingMuted: true },
      classNames: { filter: 'border-orange-500 bg-orange-500/20 text-orange-400' },
    },
    {
      label: 'Affiliated',
      value: 'affiliated',
      color: 'cyan',
      icon: 'ri:verified-badge-line',
      whereClause: {
        author: {
          serviceAffiliations: { some: {} },
        },
      },
      classNames: { filter: 'border-cyan-500 bg-cyan-500/20 text-cyan-400' },
    },
  ] as const satisfies CommentStatusFilterInfo[]
)

export type CommentStatusFilter = (typeof commentStatusFilters)[number]['value']

export function getCommentStatusFilterValue(
  comment: Prisma.CommentGetPayload<{
    select: {
      status: true
      ratingMuted: true
      ratingMuteReason: true
      humanAction: true
    }
  }>
): CommentStatusFilter {
  if (comment.humanAction === 'HOLD') return 'on-hold'
  if (
    comment.ratingMuted &&
    (comment.ratingMuteReason === 'SUSPICIOUS_PATTERN' ||
      comment.ratingMuteReason === 'TEMPLATE_SPAM')
  ) {
    return 'suspicious'
  }

  switch (comment.status) {
    case 'PENDING': {
      return 'pending'
    }
    case 'VERIFIED': {
      return 'verified'
    }
    case 'REJECTED': {
      return 'rejected'
    }
    case 'APPROVED': {
      return 'approved'
    }
    default: {
      return 'all'
    }
  }
}
