import { glob } from 'astro/loaders'
import { defineCollection, z } from 'astro:content'

const blog = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1).max(120),
      summary: z.string().min(1).max(300),
      author: z.string().default('pluja'),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date().optional(),
      tags: z
        .array(z.string())
        .default([])
        .transform((tags) =>
          Array.from(
            new Set(
              tags
                .map((tag) =>
                  tag
                    .toLowerCase()
                    .trim()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                )
                .filter(Boolean)
            )
          )
        ),
      coverImage: image().optional(),
      draft: z.boolean().default(false),
    }),
})

export const collections = { blog }
