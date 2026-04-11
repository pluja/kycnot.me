import rss from '@astrojs/rss'

import { getPublishedPosts, postUrl } from '../../lib/blog'
import { markdownToHtml } from '../../lib/markdown'
import { absoluteSiteUrl, siteOrigin } from '../../lib/urls'

import type { APIRoute } from 'astro'

export const prerender = true

export const GET: APIRoute = async (context) => {
  const posts = await getPublishedPosts()

  const items = await Promise.all(
    posts.map(async (post) => ({
      title: post.data.title,
      pubDate: post.data.publishedAt,
      description: post.data.summary,
      link: postUrl(post),
      author: post.data.author,
      categories: post.data.tags,
      content: await markdownToHtml(post.body ?? '', {
        allowImages: true,
        // Blog posts are authored in-repo and trusted; raw HTML is enabled so
        // sponsored review anchors (`rel="sponsored"`) survive into the feed.
        allowRawHtml: true,
        linkRel: ['nofollow', 'noopener', 'noreferrer'],
      }),
    }))
  )

  return rss({
    title: 'KYCnot.me Blog',
    description:
      'Articles, guides, and updates about no-KYC services, privacy, and cryptocurrency safety.',
    site: siteOrigin,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    items,
    customData: `<language>en-us</language><atom:link href="${absoluteSiteUrl(context.url.pathname)}" rel="self" type="application/rss+xml"/>`,
  })
}
