import he from 'he'

import { getAllTags, getPublishedPosts, postUrl, tagUrl } from '../../lib/blog'

import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ site }) => {
  if (!site) return new Response('Site URL not configured', { status: 500 })

  try {
    const posts = await getPublishedPosts()
    const tags = getAllTags(posts)
    const origin = site.origin
    const now = Date.now()

    const entries: string[] = []

    const indexLastmodDate =
      posts.length > 0
        ? (posts[0]?.data.updatedAt ?? posts[0]?.data.publishedAt ?? new Date())
        : new Date()
    const indexLastmod = indexLastmodDate.toISOString().slice(0, 10)
    entries.push(
      `<url><loc>${he.encode(`${origin}/blog`)}</loc><lastmod>${indexLastmod}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`
    )

    for (const post of posts) {
      const loc = he.encode(`${origin}${postUrl(post)}`)
      const lastmodDate = post.data.updatedAt ?? post.data.publishedAt
      const lastmod = lastmodDate.toISOString().slice(0, 10)
      const daysSinceUpdate = (now - lastmodDate.getTime()) / (1000 * 60 * 60 * 24)
      const changefreq = daysSinceUpdate < 30 ? 'weekly' : daysSinceUpdate < 180 ? 'monthly' : 'yearly'
      const priority = daysSinceUpdate < 90 ? '0.8' : '0.6'
      entries.push(
        `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`
      )
    }

    for (const tag of tags) {
      const loc = he.encode(`${origin}${tagUrl(tag)}`)
      entries.push(
        `<url><loc>${loc}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>`
      )
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${entries.join('\n  ')}
</urlset>`

    return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
  } catch (error) {
    console.error('Failed to generate blog sitemap:', error)
    return new Response('Failed to generate blog sitemap', { status: 500 })
  }
}
