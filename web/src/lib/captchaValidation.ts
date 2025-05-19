import { z, type RefinementCtx } from 'astro/zod'

import { CAPTCHA_LENGTH, verifyCaptcha } from './captcha'

export const captchaFormSchemaProperties = {
  'captcha-value': z
    .string()
    .length(CAPTCHA_LENGTH, `Captcha must be ${CAPTCHA_LENGTH.toLocaleString()} characters long`)
    .regex(/^[A-Za-z0-9]+$/, 'Captcha must contain only uppercase letters and numbers'),
  'captcha-solution-hash': z.string().min(1, 'Missing internal captcha data'),
} as const

export const captchaFormSchemaSuperRefine = (
  value: z.infer<z.ZodObject<typeof captchaFormSchemaProperties>>,
  ctx: RefinementCtx
) => {
  const isValidCaptcha = verifyCaptcha(value['captcha-value'], value['captcha-solution-hash'])
  if (!isValidCaptcha) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['captcha-value'],
      message: 'Incorrect captcha',
    })
  }
}

export const captchaFormSchema = z
  .object(captchaFormSchemaProperties)
  .superRefine(captchaFormSchemaSuperRefine)
