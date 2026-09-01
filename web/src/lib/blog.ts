import { getCollection } from 'astro:content'

import type { CollectionEntry } from 'astro:content'

export type BlogPost = CollectionEntry<'blog'>

const WORDS_PER_MINUTE = 200

export function calculateReadingTime(content: string): number {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE))
}

/**
 * Returns blog posts sorted newest-first. By default, drafts are excluded.
 * Pass `includeDrafts: true` from admin contexts to include them inline.
 *
 * Machine surfaces (RSS, sitemap) must NEVER pass `includeDrafts: true`.
 * Public navigation (related, prev/next) should also use the published-only
 * default so drafts do not appear in link graphs.
 */
export async function getPublishedPosts({ includeDrafts = false } = {}): Promise<BlogPost[]> {
  const all = await getCollection('blog')
  const filtered = includeDrafts ? all : all.filter((post) => !post.data.draft)
  return [...filtered].sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime())
}

export function getRelatedPosts(current: BlogPost, all: BlogPost[], limit = 3): BlogPost[] {
  const currentTags = new Set(current.data.tags)
  if (currentTags.size === 0) {
    return all.filter((post) => post.id !== current.id).slice(0, limit)
  }

  return all
    .filter((post) => post.id !== current.id)
    .map((post) => ({
      post,
      overlap: post.data.tags.filter((tag) => currentTags.has(tag)).length,
    }))
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap
      return b.post.data.publishedAt.getTime() - a.post.data.publishedAt.getTime()
    })
    .slice(0, limit)
    .map(({ post }) => post)
}

export function getPrevNextPosts(
  current: BlogPost,
  all: BlogPost[]
): { older: BlogPost | null; newer: BlogPost | null } {
  const index = all.findIndex((post) => post.id === current.id)
  if (index === -1) return { older: null, newer: null }
  return {
    older: index < all.length - 1 ? (all[index + 1] ?? null) : null,
    newer: index > 0 ? (all[index - 1] ?? null) : null,
  }
}

export function getAllTags(posts: BlogPost[]): string[] {
  const tags = new Set<string>()
  for (const post of posts) {
    for (const tag of post.data.tags) {
      tags.add(tag)
    }
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b))
}

/**
 * Posts a tag needs before its page is worth indexing.
 *
 * Below this the page is a near-duplicate of the single post it links to, and
 * the blog currently has more tags than posts. The page still renders and
 * stays crawlable so tag navigation keeps working.
 */
export const MIN_POSTS_FOR_INDEXABLE_TAG = 3

/**
 * Tags with enough posts to stand as their own page.
 *
 * The sitemap and the page's `noindex` both read this, so a tag can never be
 * submitted for indexing while the page itself asks to be left out.
 */
export function getIndexableTags(posts: BlogPost[]): string[] {
  const postsPerTag = new Map<string, number>()
  for (const post of posts) {
    for (const tag of post.data.tags) {
      postsPerTag.set(tag, (postsPerTag.get(tag) ?? 0) + 1)
    }
  }
  return Array.from(postsPerTag)
    .filter(([, count]) => count >= MIN_POSTS_FOR_INDEXABLE_TAG)
    .map(([tag]) => tag)
    .sort((a, b) => a.localeCompare(b))
}

export function tagToSlug(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function slugToTag(slug: string, allTags: string[]): string | null {
  return allTags.find((tag) => tagToSlug(tag) === slug) ?? null
}

export function postUrl(post: BlogPost): string {
  return `/blog/${post.id}`
}

export function tagUrl(tag: string): string {
  return `/blog/tag/${tagToSlug(tag)}`
}
