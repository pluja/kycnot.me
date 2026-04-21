import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { AttributeCategory } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type AttributeCategoryInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
  classNames: {
    icon: string
  }
  order: number
}

export const {
  dataArray: attributeCategories,
  dataObject: attributeCategoriesById,
  getFn: getAttributeCategoryInfo,
  getFnSlug: getAttributeCategoryInfoBySlug,
  zodEnumBySlug: attributeCategoriesZodEnumBySlug,
  zodEnumById: attributeCategoriesZodEnumById,
  keyToSlug: attributeCategoryIdToSlug,
  slugToKey: attributeCategorySlugToId,
} = makeHelpersForOptions(
  'value',
  (value): AttributeCategoryInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase().replace('_', '-') : '',
    label: value ? transformCase(value, 'title') : String(value),
    icon: 'ri:shield-fill',
    classNames: {
      icon: 'text-current/60',
    },
    order: Infinity,
  }),
  [
    {
      value: 'PRIVACY',
      slug: 'privacy',
      label: 'Privacy',
      icon: 'ri:shield-user-fill',
      classNames: {
        icon: 'text-blue-500',
      },
      order: 1,
    },
    {
      value: 'TRUST',
      slug: 'trust',
      label: 'Trust',
      icon: 'ri:shield-check-fill',
      classNames: {
        icon: 'text-green-500',
      },
      order: 2,
    },
    {
      value: 'KYC',
      slug: 'kyc',
      label: 'KYC',
      icon: 'ri:fingerprint-line',
      classNames: {
        icon: 'text-blue-500',
      },
      order: 3,
    },
  ] as const satisfies AttributeCategoryInfo<AttributeCategory>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof attributeCategories)[number]['value'], AttributeCategory>>
