import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { AttributeType } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type AttributeTypeInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  icon: string
  order: number
  classNames: {
    container: string
    subcontainer: string
    text: string
    textLight: string
    icon: string
    button: string
  }
}

export const {
  dataArray: attributeTypes,
  dataObject: attributeTypesById,
  getFn: getAttributeTypeInfo,
  getFnSlug: getAttributeTypeInfoBySlug,
  zodEnumBySlug: attributeTypesZodEnumBySlug,
  zodEnumById: attributeTypesZodEnumById,
  keyToSlug: attributeTypeIdToSlug,
  slugToKey: attributeTypeSlugToId,
} = makeHelpersForOptions(
  'value',
  (value): AttributeTypeInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase().replace('_', '-') : '',
    label: value ? transformCase(value, 'title') : String(value),
    icon: 'ri:question-fill',
    order: Infinity,
    classNames: {
      container: 'bg-current/30',
      subcontainer: 'bg-current/5 border-current/30',
      text: 'text-current/60',
      textLight: 'text-current/40',
      icon: 'text-current/60',
      button: 'bg-current/80 text-current/100 hover:bg-current/50',
    },
  }),
  [
    {
      value: 'BAD',
      slug: 'bad',
      label: 'Bad',
      icon: 'ri:close-circle-fill',
      order: 1,
      classNames: {
        container: 'bg-red-600/30',
        subcontainer: 'bg-red-600/5 border-red-600/30',
        text: 'text-red-200',
        textLight: 'text-red-100',
        icon: 'text-red-400',
        button: 'bg-red-200 text-red-900 hover:bg-red-50',
      },
    },
    {
      value: 'WARNING',
      slug: 'warning',
      label: 'Warning',
      icon: 'ri:alert-fill',
      order: 2,
      classNames: {
        container: 'bg-yellow-600/30',
        subcontainer: 'bg-yellow-600/5 border-yellow-600/30',
        text: 'text-yellow-200',
        textLight: 'text-amber-100',
        icon: 'text-yellow-400',
        button: 'bg-amber-100 text-amber-900 hover:bg-amber-50',
      },
    },
    {
      value: 'GOOD',
      slug: 'good',
      label: 'Good',
      icon: 'ri:checkbox-circle-fill',
      order: 3,
      classNames: {
        container: 'bg-green-600/30',
        subcontainer: 'bg-green-600/5 border-green-600/30',
        text: 'text-green-200',
        textLight: 'text-green-100',
        icon: 'text-green-400',
        button: 'bg-green-200 text-green-900 hover:bg-green-50',
      },
    },
    {
      value: 'INFO',
      slug: 'info',
      label: 'Info',
      icon: 'ri:information-fill',
      order: 4,
      classNames: {
        container: 'bg-blue-600/30',
        subcontainer: 'bg-blue-600/5 border-blue-600/30',
        text: 'text-blue-200',
        textLight: 'text-blue-100',
        icon: 'text-blue-400',
        button: 'bg-blue-200 text-blue-900 hover:bg-blue-50',
      },
    },
  ] as const satisfies AttributeTypeInfo<AttributeType>[]
)

export const baseScoreType = {
  value: 'BASE_SCORE',
  slug: 'base-score',
  label: 'Base score',
  icon: 'ri:information-line',
  order: 5,
  classNames: {
    container: 'bg-night-500',
    subcontainer: '',
    text: 'text-day-200',
    textLight: '',
    icon: '',
    button: '',
  },
} as const satisfies AttributeTypeInfo

type _ExpectToHaveAllValues = Assert<Equals<(typeof attributeTypes)[number]['value'], AttributeType>>
