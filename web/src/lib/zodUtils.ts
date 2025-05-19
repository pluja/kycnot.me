import { z, type ZodTypeAny } from 'astro/zod'
import { round } from 'lodash-es'

const addZodPipe = (schema: ZodTypeAny, zodPipe?: ZodTypeAny) => {
  return zodPipe ? schema.pipe(zodPipe) : schema
}

/**
 * The difference between this and `z.coerce.number()` is that an empty string won't be coerced to 0.
 *
 * If you don't accept 0, just use `z.coerce.number().int().positive()` instead.
 */
export const zodCohercedNumber = (zodPipe?: ZodTypeAny) =>
  addZodPipe(z.number().or(z.string().nonempty()), zodPipe)

export const zodUrlOptionalProtocol = z.preprocess(
  (input) => {
    if (typeof input !== 'string') return input
    const trimmedVal = input.trim()
    return !/^\w+:\/\//i.test(trimmedVal) ? `https://${trimmedVal}` : trimmedVal
  },
  z.string().refine((value) => /^(https?):\/\/(?=.*\.[a-z]{2,})[^\s$.?#].[^\s]*$/i.test(value), {
    message: 'Invalid URL',
  })
)

const stringToArrayFactory = (delimiter: RegExp | string = ',') => {
  return <T>(input: T) =>
    typeof input !== 'string'
      ? (input ?? undefined)
      : input
          .split(delimiter)
          .map((item) => item.trim())
          .filter((item) => item !== '')
}

export const stringListOfUrlsSchema = z.preprocess(
  stringToArrayFactory(/[\s,\n]+/),
  z.array(zodUrlOptionalProtocol).default([])
)

export const stringListOfUrlsSchemaRequired = z.preprocess(
  stringToArrayFactory(/[\s,\n]+/),
  z.array(zodUrlOptionalProtocol).min(1)
)

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

export const ACCEPTED_IMAGE_TYPES = [
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/jxl',
  'image/avif',
  'image/webp',
] as const satisfies string[]

export const imageFileSchema = z
  .instanceof(File)
  .optional()
  .nullable()
  .transform((file) => (!file || file.size === 0 || !file.name ? undefined : file))
  .refine(
    (file) => !file || file.size <= MAX_IMAGE_SIZE,
    `Max image size is ${round(MAX_IMAGE_SIZE / 1024 / 1024, 3).toLocaleString()}MB.`
  )
  .refine(
    (file) => !file || ACCEPTED_IMAGE_TYPES.some((type) => file.type === type),
    'Only SVG, PNG, JPG, JPEG XL, AVIF, WebP formats are supported.'
  )

export const imageFileSchemaRequired = imageFileSchema.refine((file) => !!file, 'Required')
