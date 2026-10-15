import { Prisma, ServiceUserRole } from '@prisma/client'

import { publishedCommentStatuses } from './experiences'
import { prisma } from './prisma'

const replyPreviewSelect = {
  id: true,
  content: true,
  createdAt: true,
  author: {
    select: {
      name: true,
      displayName: true,
      admin: true,
      capabilities: true,
      serviceAffiliations: { select: { role: true } },
    },
  },
} satisfies Prisma.CommentSelect

type ReplyPreview = Prisma.CommentGetPayload<{ select: typeof replyPreviewSelect }>

export type CommentReplyPreviewGroup = {
  count: number
  serviceReplied: boolean
  ownerReplied: boolean
  staffReplied: boolean
  replies: ReplyPreview[]
}

// getCommentReplyPreviews picks two replies per post, preferring moderators,
// then the service owner and team, then the latest, and returns them oldest
// first so they read like the thread.
export async function getCommentReplyPreviews(
  rootIds: number[],
  serviceId: number,
  restrictedAuthorId?: number
) {
  const groups = new Map<number, CommentReplyPreviewGroup>()
  if (!rootIds.length) return groups

  const rows = await prisma.$queryRaw<
    {
      id: number
      rootId: number
      count: number
      serviceReplied: boolean
      ownerReplied: boolean
      staffReplied: boolean
    }[]
  >(Prisma.sql`
    WITH replies AS (
      SELECT c.id, c."parentId" AS "rootId", c."createdAt",
        EXISTS (SELECT 1 FROM "ServiceUser" s WHERE s."userId" = c."authorId" AND s."serviceId" = ${serviceId}) AS "serviceReply",
        EXISTS (SELECT 1 FROM "ServiceUser" s WHERE s."userId" = c."authorId" AND s."serviceId" = ${serviceId} AND s.role = ${ServiceUserRole.OWNER}::"ServiceUserRole") AS "ownerReply",
        COALESCE(u.admin OR 'comments:moderate' = ANY(u.capabilities), false) AS "staffReply"
      FROM "Comment" c
      LEFT JOIN "User" u ON u.id = c."authorId"
      WHERE c."parentId" IN (${Prisma.join(rootIds)}) AND c."serviceId" = ${serviceId}
        AND c.status::text = ANY(${publishedCommentStatuses})
        AND (${restrictedAuthorId ?? null}::int IS NULL OR c."authorId" = ${restrictedAuthorId ?? null})
    ), ranked AS (
      SELECT r.*,
        (COUNT(*) OVER (PARTITION BY "rootId"))::int AS count,
        BOOL_OR("serviceReply") OVER (PARTITION BY "rootId") AS "serviceReplied",
        BOOL_OR("ownerReply") OVER (PARTITION BY "rootId") AS "ownerReplied",
        BOOL_OR("staffReply") OVER (PARTITION BY "rootId") AS "staffReplied",
        ROW_NUMBER() OVER (
          PARTITION BY "rootId"
          ORDER BY "staffReply" DESC, "ownerReply" DESC, "serviceReply" DESC, "createdAt" DESC, id DESC
        ) AS position
      FROM replies r
    )
    SELECT id, "rootId", count, "serviceReplied", "ownerReplied", "staffReplied"
    FROM ranked WHERE position <= 2
  `)
  if (!rows.length) return groups

  const replies = await prisma.comment.findMany({
    where: {
      id: { in: rows.map((row) => row.id) },
      serviceId,
      authorId: restrictedAuthorId,
      status: { in: publishedCommentStatuses },
    },
    select: {
      ...replyPreviewSelect,
      author: {
        select: {
          ...replyPreviewSelect.author.select,
          serviceAffiliations: {
            where: { serviceId },
            select: { role: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  for (const reply of replies) {
    const row = rowsById.get(reply.id)
    if (!row) continue
    const group: CommentReplyPreviewGroup = groups.get(row.rootId) ?? {
      count: row.count,
      serviceReplied: row.serviceReplied,
      ownerReplied: row.ownerReplied,
      staffReplied: row.staffReplied,
      replies: [],
    }
    group.replies.push(reply)
    groups.set(row.rootId, group)
  }
  return groups
}
