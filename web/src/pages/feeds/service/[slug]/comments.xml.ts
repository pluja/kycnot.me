import rss from '@astrojs/rss'
import { SITE_URL } from 'astro:env/client'

import { getServiceUserRoleInfo } from '../../../../constants/serviceUserRoles'
import { makeCommentUrl } from '../../../../lib/commentsWithReplies'
import { getCommentsForService } from '../../../../lib/feeds'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async (context) => {
  try {
    const origin = context.site?.origin ?? new URL(SITE_URL).origin

    const result = await getCommentsForService(context.params.slug)
    if (!result.success) return new Response(result.error.message, result.error.responseInit)
    const { service, comments } = result.data

    return await rss({
      title: `${service.name} - Comments & Reviews | KYCnot.me`,
      description: `Latest comments and reviews about ${service.name} from KYCnot.me users`,
      site: origin,
      xmlns: { dc: 'http://purl.org/dc/elements/1.1/', atom: 'http://www.w3.org/2005/Atom' },
      items: comments.map((comment) => {
        const authorName = comment.author.displayName ?? comment.author.name
        const isRating = comment.ratingActive && comment.rating
        const title = isRating
          ? `${authorName} rated ${service.name} (${String(comment.rating)}/5 stars)`
          : `${authorName} commented on ${service.name}`

        const badges = [
          comment.author.verified ? '✅' : null,
          comment.author.spammer ? '(Spammer)' : null,
          comment.author.admin ? '(Admin)' : null,
          comment.author.moderator && !comment.author.admin ? '(Moderator)' : null,
          ...comment.author.serviceAffiliations.map(
            (affiliation) =>
              ` (${getServiceUserRoleInfo(affiliation.role).label} at ${affiliation.service.name})`
          ),
        ].filter((badge) => badge !== null)

        return {
          title,
          pubDate: comment.createdAt,
          description: comment.content,
          link: makeCommentUrl({
            origin,
            serviceSlug: service.slug,
            commentId: comment.id,
          }),
          categories: isRating ? ['Rating'] : ['Comment'],
          guid: `${service.slug}-comment-${String(comment.id)}`,
          customData: `<dc:creator>${authorName}${badges.length > 0 ? ` ${badges.join(' ')}` : ''}</dc:creator>`,
        }
      }),
      customData: `<language>en-us</language><atom:link href="${context.url.href}" rel="self" type="application/rss+xml"/>`,
    })
  } catch (error) {
    console.error('Error generating service comments RSS feed:', error)
    return new Response('Error generating RSS feed', { status: 500 })
  }
}
