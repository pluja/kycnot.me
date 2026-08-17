import { VerificationStatus } from '@prisma/client'
import { z } from 'zod'

import {
  countOgImageEmoji,
  isAllowedOgImageSource,
  isWithinOgImageTextBudget,
  OG_IMAGE_ICON_PATTERN,
  OG_IMAGE_LIMITS,
} from './ogImageInput'
import { badgeThemes } from './serviceBadges'

import type { Prettify } from 'ts-essentials'

const MAX_SUMMARIZED_ISSUES = 8

const verificationStatusSchema = z.nativeEnum(VerificationStatus).nullable()
const scoreSchema = z.number().finite().int().min(0).max(10)
const ratingSchema = z.number().finite().min(0).max(5)
const kycLevelSchema = z.number().finite().int().min(0).max(4)
const iconSchema = z.string().max(OG_IMAGE_LIMITS.icon).regex(OG_IMAGE_ICON_PATTERN)
const imageSourceSchema = z.string().max(OG_IMAGE_LIMITS.imageSource).refine(isAllowedOgImageSource)
const requiredTextSchema = (maxLength: number) => z.string().trim().min(1).max(maxLength)

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
      description: z.string().max(OG_IMAGE_LIMITS.service.description),
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
    )
    .refine(
      ({ categories, description, title }) =>
        countOgImageEmoji([title, description, ...categories.map(({ name }) => name)]) <=
        OG_IMAGE_LIMITS.maxEmoji,
      { path: ['emoji'] }
    ),
  generic: z
    .object({
      title: requiredTextSchema(OG_IMAGE_LIMITS.generic.title),
      description: z.string().max(OG_IMAGE_LIMITS.generic.description).nullish(),
      icon: iconSchema.nullish(),
    })
    .strict()
    .refine(
      ({ description, title }) =>
        isWithinOgImageTextBudget([title, description ?? ''], OG_IMAGE_LIMITS.generic.totalText),
      { path: ['renderedText'] }
    )
    .refine(
      ({ description, title }) => countOgImageEmoji([title, description ?? '']) <= OG_IMAGE_LIMITS.maxEmoji,
      { path: ['emoji'] }
    ),
  blog: z
    .object({
      title: requiredTextSchema(OG_IMAGE_LIMITS.blog.title),
      coverImage: imageSourceSchema.nullish(),
      author: z.string().max(OG_IMAGE_LIMITS.blog.author).nullish(),
      publishedAt: z.string().max(40).datetime({ offset: true }).nullish(),
    })
    .strict()
    .refine(
      ({ author, title }) => isWithinOgImageTextBudget([title, author ?? ''], OG_IMAGE_LIMITS.blog.totalText),
      { path: ['renderedText'] }
    )
    .refine(({ author, title }) => countOgImageEmoji([title, author ?? '']) <= OG_IMAGE_LIMITS.maxEmoji, {
      path: ['emoji'],
    }),
} as const satisfies Record<string, z.ZodType>

export const badgeOgImagePropsSchemas = {
  'badge-lg': badgePropsSchema
    .extend({ name: requiredTextSchema(OG_IMAGE_LIMITS.badge.name) })
    .strict()
    .refine(({ name }) => countOgImageEmoji([name]) <= OG_IMAGE_LIMITS.maxEmoji, {
      path: ['emoji'],
    }),
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
