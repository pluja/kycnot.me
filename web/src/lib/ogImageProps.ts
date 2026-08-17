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

const badgePropsSchema = z
  .object({
    verificationStatus: verificationStatusSchema,
    overallScore: z.number().nullable(),
    averageUserRating: z.number().nullable(),
    kycLevel: z.number().nullable(),
    showScore: z.boolean(),
    showRating: z.boolean(),
    showKycLevel: z.boolean(),
    theme: z.enum(badgeThemes),
  })
  .strict()

// publicOgImagePropsSchemas defines the unauthenticated `?data=` contract.
// Badge templates stay outside it because their claims must come from the
// database-backed badge route.
export const publicOgImagePropsSchemas = {
  default: z.object({}).strict(),
  service: z
    .object({
      title: z.string(),
      description: z.string(),
      categories: z
        .array(z.object({ name: z.string(), icon: z.string() }).strict())
        .transform((categories) => categories.slice(0, MAX_RENDERED_CATEGORIES)),
      score: z.number(),
      imageUrl: z.string().nullish(),
      verificationStatus: verificationStatusSchema,
    })
    .strict(),
  generic: z
    .object({
      title: z.string(),
      description: z.string().nullish(),
      icon: z.string().nullish(),
    })
    .strict(),
  blog: z
    .object({
      title: z.string(),
      coverImage: z.string().nullish(),
      author: z.string().nullish(),
      publishedAt: z.string().nullish(),
    })
    .strict(),
} as const satisfies Record<string, z.ZodType>

export const badgeOgImagePropsSchemas = {
  'badge-lg': badgePropsSchema.extend({ name: z.string() }).strict(),
  'badge-sm': badgePropsSchema,
  'badge-xs': badgePropsSchema.pick({ theme: true, verificationStatus: true }).strict(),
} as const satisfies Record<string, z.ZodType>

type OgImagePropsSchemas = typeof badgeOgImagePropsSchemas & typeof publicOgImagePropsSchemas

export type OgImageTemplateName = keyof OgImagePropsSchemas
export type OgImageBadgeTemplateName = keyof typeof badgeOgImagePropsSchemas
export type OgImagePublicTemplateName = keyof typeof publicOgImagePropsSchemas

// OgImageProps is what a template receives, after parsing.
export type OgImageProps<K extends OgImageTemplateName> = z.output<OgImagePropsSchemas[K]>

export type OgImagePublicTemplateWithProps = Prettify<
  {
    // eslint-disable-next-line @typescript-eslint/sort-type-constituents
    [K in OgImagePublicTemplateName]: { template: K } & z.input<(typeof publicOgImagePropsSchemas)[K]>
  }[OgImagePublicTemplateName]
>

// summarizeIssues keeps the rejected values out of the log and reports only
// which fields failed and how.
export function summarizeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`).join(', ')
}
