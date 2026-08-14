import { VerificationStatus } from '@prisma/client'
import { z } from 'zod'

import { badgeThemes } from './serviceBadges'

import type { Prettify } from 'ts-essentials'

// MAX_RENDERED_CATEGORIES bounds the icon fan-out: each entry costs a
// third-party fetch and a rasterization while holding a render slot. Extra
// entries are dropped rather than rejected, so a service that gains a category
// keeps its card.
const MAX_RENDERED_CATEGORIES = 8

const verificationStatusSchema = z.nativeEnum(VerificationStatus).nullable()

const badgePropsSchema = z.object({
  verificationStatus: verificationStatusSchema,
  overallScore: z.number().nullable(),
  averageUserRating: z.number().nullable(),
  kycLevel: z.number().nullable(),
  showScore: z.boolean(),
  showRating: z.boolean(),
  showKycLevel: z.boolean(),
  theme: z.enum(badgeThemes),
})

// ogImagePropsSchemas is the contract for the `?data=` query param. It is
// unauthenticated, so a template only ever sees props that parsed: without this
// a string where a number belongs reaches satori and either throws mid-render or
// paints "NaN" onto a card that then caches for a year.
export const ogImagePropsSchemas = {
  default: z.object({}),
  service: z.object({
    title: z.string(),
    description: z.string(),
    categories: z
      .array(z.object({ name: z.string(), icon: z.string() }))
      .transform((categories) => categories.slice(0, MAX_RENDERED_CATEGORIES)),
    score: z.number(),
    imageUrl: z.string().nullish(),
    verificationStatus: verificationStatusSchema,
  }),
  generic: z.object({
    title: z.string(),
    description: z.string().nullish(),
    icon: z.string().nullish(),
  }),
  blog: z.object({
    title: z.string(),
    coverImage: z.string().nullish(),
    author: z.string().nullish(),
    publishedAt: z.string().nullish(),
  }),
  'badge-lg': badgePropsSchema.extend({ name: z.string() }),
  'badge-sm': badgePropsSchema,
  'badge-xs': badgePropsSchema.pick({ theme: true, verificationStatus: true }),
} as const satisfies Record<string, z.ZodType>

export type OgImageTemplateName = keyof typeof ogImagePropsSchemas

// OgImageProps is what a template receives, after parsing.
export type OgImageProps<K extends OgImageTemplateName> = z.output<(typeof ogImagePropsSchemas)[K]>

// OgImageAllTemplatesWithProps is what a page passes to build the `?data=` URL,
// so it is the schema input: the side that has not been parsed yet.
export type OgImageAllTemplatesWithProps = Prettify<
  {
    // eslint-disable-next-line @typescript-eslint/sort-type-constituents
    [K in OgImageTemplateName]: { template: K } & z.input<(typeof ogImagePropsSchemas)[K]>
  }[OgImageTemplateName]
>

// summarizeIssues keeps the rejected values out of the log and reports only
// which fields failed and how.
export function summarizeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`).join(', ')
}
