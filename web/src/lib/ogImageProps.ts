import { VerificationStatus } from '@prisma/client'
import { z } from 'zod'

import {
  isAllowedOgImageSource,
  isWithinOgImageTextBudget,
  OG_IMAGE_ICON_PATTERN,
  OG_IMAGE_LIMITS,
  stripOgImageEmoji,
} from './ogImageInput'
import { badgeThemes } from './serviceBadges'

import type { Prettify } from 'ts-essentials'

const MAX_SUMMARIZED_ISSUES = 8

const verificationStatusSchema = z.nativeEnum(VerificationStatus).nullable()
const scoreSchema = z.number().finite().int().min(OG_IMAGE_LIMITS.score.min).max(OG_IMAGE_LIMITS.score.max)
const ratingSchema = z.number().finite().min(OG_IMAGE_LIMITS.rating.min).max(OG_IMAGE_LIMITS.rating.max)
const kycLevelSchema = z
  .number()
  .finite()
  .int()
  .min(OG_IMAGE_LIMITS.kycLevel.min)
  .max(OG_IMAGE_LIMITS.kycLevel.max)
const iconSchema = z.string().max(OG_IMAGE_LIMITS.icon).regex(OG_IMAGE_ICON_PATTERN)
const imageSourceSchema = z.string().max(OG_IMAGE_LIMITS.imageSource).refine(isAllowedOgImageSource)
// Text schemas strip emoji before length checks so `?data=` cannot put one in
// front of satori. This is the only chokepoint both the public endpoint and the
// badge route share, so it has to happen here rather than in the normalizer.
const optionalTextSchema = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => stripOgImageEmoji(value).trim())
const requiredTextSchema = (maxLength: number) => optionalTextSchema(maxLength).pipe(z.string().trim().min(1))

const badgePropsSchema = z
  .object({
    verificationStatus: verificationStatusSchema,
    overallScore: scoreSchema.nullable(),
    averageUserRating: ratingSchema.nullable(),
    kycLevel: kycLevelSchema.nullable(),
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
      title: requiredTextSchema(OG_IMAGE_LIMITS.service.title),
      description: optionalTextSchema(OG_IMAGE_LIMITS.service.description),
      categories: z
        .array(
          z
            .object({
              name: requiredTextSchema(OG_IMAGE_LIMITS.service.categoryName),
              icon: iconSchema,
            })
            .strict()
        )
        .max(OG_IMAGE_LIMITS.maxCategories),
      score: scoreSchema,
      imageUrl: imageSourceSchema.nullish(),
      verificationStatus: verificationStatusSchema,
    })
    .strict()
    .refine(
      ({ categories, description, title }) =>
        isWithinOgImageTextBudget(
          [title, description, ...categories.map(({ name }) => name)],
          OG_IMAGE_LIMITS.service.totalText
        ),
      { path: ['renderedText'] }
    ),
  generic: z
    .object({
      title: requiredTextSchema(OG_IMAGE_LIMITS.generic.title),
      description: optionalTextSchema(OG_IMAGE_LIMITS.generic.description).nullish(),
      icon: iconSchema.nullish(),
    })
    .strict()
    .refine(
      ({ description, title }) =>
        isWithinOgImageTextBudget([title, description ?? ''], OG_IMAGE_LIMITS.generic.totalText),
      { path: ['renderedText'] }
    ),
  blog: z
    .object({
      title: requiredTextSchema(OG_IMAGE_LIMITS.blog.title),
      coverImage: imageSourceSchema.nullish(),
      author: optionalTextSchema(OG_IMAGE_LIMITS.blog.author).nullish(),
      publishedAt: z.string().max(40).datetime({ offset: true }).nullish(),
    })
    .strict()
    .refine(
      ({ author, title }) => isWithinOgImageTextBudget([title, author ?? ''], OG_IMAGE_LIMITS.blog.totalText),
      { path: ['renderedText'] }
    ),
} as const satisfies Record<string, z.ZodType>

export const badgeOgImagePropsSchemas = {
  'badge-lg': badgePropsSchema.extend({ name: requiredTextSchema(OG_IMAGE_LIMITS.badge.name) }).strict(),
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
  const issues = error.issues
    .slice(0, MAX_SUMMARIZED_ISSUES)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`)
  const omittedCount = error.issues.length - issues.length
  if (omittedCount > 0) issues.push(`${String(omittedCount)} more`)
  return issues.join(', ')
}
