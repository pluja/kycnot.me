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

const cleanUrl = (input: unknown) => {
  if (typeof input !== 'string') return input
  const cleanInput = input.trim().replace(/\/$/, '')
  return !/^\w+:\/\//i.test(cleanInput) ? `https://${cleanInput}` : cleanInput
}

export const zodUrlOptionalProtocol = z.preprocess(
  cleanUrl,
  z.string().refine((value) => /^(https?):\/\/(?=.*\.[a-z0-9]{2,})[^\s$.?#].[^\s]*$/i.test(value), {
    message: 'Invalid URL',
  })
)

export const zodContactMethod = z.preprocess(
  (input) => {
    if (typeof input !== 'string') return input
    const cleanInput = input.trim()

    if (/^([\d\s+\-_/()[\]*#.,]|ext|x){7,}$/i.test(cleanInput)) return `tel:${cleanInput}`

    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanInput)) return `mailto:${cleanInput}`

    return cleanUrl(cleanInput)
  },
  z
    .string()
    .trim()
    .refine(
      (value) =>
        /^((https?):\/\/(?=.*\.[a-z0-9]{2,})[^\s$.?#].[^\s]|([\d\s+\-_/()[\]*#.,]|ext|x){7,}|[0-9\s+-_\\/()[\]*#.]|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})*$/i.test(
          value
        ),
      {
        message: 'Invalid contact method',
      }
    )
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

export const stringListOfSlugsSchemaRequired = z.preprocess(
  stringToArrayFactory(/[\s,\n]+/),
  z.array(z.string().regex(/^[a-z0-9-_A-Z]+$/)).min(1)
)

export const stringListOfUrlsSchema = z.preprocess(
  stringToArrayFactory(/[\s,\n]+/),
  z.array(zodUrlOptionalProtocol).default([])
)

export const stringListOfUrlsSchemaRequired = z.preprocess(
  stringToArrayFactory(/[\s,\n]+/),
  z.array(zodUrlOptionalProtocol).min(1)
)

export const stringListOfContactMethodsSchema = z.preprocess(
  stringToArrayFactory(/[\s,\n]+/),
  z.array(zodContactMethod).default([])
)

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

export const ACCEPTED_IMAGE_TYPES = [
  'image/svg+xml',
  'image/png',
  'image/jpeg',
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
    'Only SVG, PNG, JPG, AVIF, WebP formats are supported.'
  )

export const imageFileSchemaRequired = imageFileSchema.refine((file) => !!file, 'Required')
