import { orderBy, groupBy } from 'lodash-es'

import { getAttributeCategoryInfo } from '../constants/attributeCategories'
import { getAttributeTypeInfo } from '../constants/attributeTypes'
import { currencies } from '../constants/currencies'
import { kycLevels } from '../constants/kycLevels'
import { networks } from '../constants/networks'
import { verificationStatuses } from '../constants/verificationStatus'

import type { Prisma } from '@prisma/client'

const MIN_CATEGORIES_TO_SHOW = 8
const MIN_ATTRIBUTES_TO_SHOW = 8

export const sortOptions = [
  {
    value: 'score-desc',
    label: 'Score (High → Low)',
    orderBy: {
      key: 'overallScore',
      direction: 'desc',
    },
  },
  {
    value: 'score-asc',
    label: 'Score (Low → High)',
    orderBy: {
      key: 'overallScore',
      direction: 'asc',
    },
  },
  {
    value: 'name-asc',
    label: 'Name (A → Z)',
    orderBy: {
      key: 'name',
      direction: 'asc',
    },
  },
  {
    value: 'name-desc',
    label: 'Name (Z → A)',
    orderBy: {
      key: 'name',
      direction: 'desc',
    },
  },
  {
    value: 'recent',
    label: 'Date listed (New → Old)',
    orderBy: {
      key: 'listedAt',
      direction: 'desc',
    },
  },
  {
    value: 'oldest',
    label: 'Date listed (Old → New)',
    orderBy: {
      key: 'listedAt',
      direction: 'asc',
    },
  },
] as const satisfies {
  value: string
  label: string
  orderBy: {
    key: keyof Prisma.ServiceSelect
    direction: 'asc' | 'desc'
  }
}[]

export const defaultSortOption = sortOptions[0]

export const modeOptions = [
  {
    value: 'or',
    label: 'OR',
  },
  {
    value: 'and',
    label: 'AND',
  },
] as const satisfies {
  value: string
  label: string
}[]

export function makeSearchFiltersOptions({
  filters,
  categories,
  attributes,
}: {
  filters: {
    categories: string[]
    attr: Record<number, '' | 'no' | 'yes'> | undefined
  } | null
  categories: Prisma.CategoryGetPayload<{
    select: {
      name: true
      namePluralLong: true
      slug: true
      icon: true
      _count: {
        select: {
          services: {
            where: {
              serviceVisibility: { in: ['PUBLIC', 'ARCHIVED'] }
            }
          }
        }
      }
    }
  }>[]
  attributes: Prisma.AttributeGetPayload<{
    select: {
      id: true
      slug: true
      title: true
      category: true
      type: true
      _count: {
        select: {
          services: true
        }
      }
    }
  }>[]
}) {
  const attributesByCategory = orderBy(
    Object.entries(
      groupBy(
        attributes.map((attr) => {
          return {
            typeInfo: getAttributeTypeInfo(attr.type),
            ...attr,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            value: filters?.attr?.[attr.id] || undefined,
          }
        }),
        'category'
      )
    ).map(([category, attributes]) => ({
      category,
      categoryInfo: getAttributeCategoryInfo(category),
      attributes: orderBy(
        attributes,
        ['value', 'type', '_count.services', 'title'],
        ['asc', 'asc', 'desc', 'asc']
      ).map((attr, i) => ({
        ...attr,
        showAlways: i < MIN_ATTRIBUTES_TO_SHOW || attr.value !== undefined,
      })),
    })),
    ['category'],
    ['asc']
  )

  const categoriesSorted = orderBy(
    categories.map((category) => {
      const checked = filters?.categories.includes(category.slug) ?? false

      return {
        ...category,
        checked,
      }
    }),
    ['checked', '_count.services', 'name'],
    ['desc', 'desc', 'asc']
  ).map((category, i) => ({
    ...category,
    showAlways: i < MIN_CATEGORIES_TO_SHOW || category.checked,
    showAlwaysOnLarge: !category.checked && i >= MIN_CATEGORIES_TO_SHOW && i < MIN_CATEGORIES_TO_SHOW * 2,
  }))

  return {
    currencies,
    categories: categoriesSorted,
    sort: sortOptions,
    modeOptions,
    network: networks,
    verification: verificationStatuses,
    attributesByCategory,
    kycLevels,
  } as const
}

export type ServicesFiltersOptions = ReturnType<typeof makeSearchFiltersOptions>
