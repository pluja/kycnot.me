import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { TailwindColor } from '../lib/colors'
import type { IncidentSeverity } from '@prisma/client'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

type IncidentSeverityInfo<T extends string | null | undefined = string> = {
  id: T
  slug: string
  label: string
  icon: string
  order: number
  color: NonNullable<TailwindColor>
  classNames: {
    rail: string
    text: string
    border: string
    bg: string
    bar: string
  }
}

export const {
  dataArray: incidentSeverities,
  dataObject: incidentSeveritiesById,
  getFn: getIncidentSeverityInfo,
} = makeHelpersForOptions(
  'id',
  (id): IncidentSeverityInfo<typeof id> => ({
    id,
    slug: id ? id.toLowerCase() : '',
    label: id ? transformCase(id, 'title') : String(id),
    icon: 'ri:error-warning-line',
    order: Infinity,
    color: 'gray',
    classNames: {
      rail: 'bg-gray-500',
      text: 'text-gray-300',
      border: 'border-gray-500/25',
      bg: 'bg-gray-500/5',
      bar: 'bg-gray-400',
    },
  }),
  [
    {
      id: 'LOW',
      slug: 'low',
      label: 'Low',
      icon: 'ri:information-line',
      order: 1,
      color: 'slate',
      classNames: {
        rail: 'bg-slate-400',
        text: 'text-slate-300',
        border: 'border-slate-500/25',
        bg: 'bg-slate-500/5',
        bar: 'bg-slate-400',
      },
    },
    {
      id: 'MEDIUM',
      slug: 'medium',
      label: 'Medium',
      icon: 'ri:alert-line',
      order: 2,
      color: 'amber',
      classNames: {
        rail: 'bg-amber-400',
        text: 'text-amber-300',
        border: 'border-amber-500/25',
        bg: 'bg-amber-500/5',
        bar: 'bg-amber-400',
      },
    },
    {
      id: 'HIGH',
      slug: 'high',
      label: 'High',
      icon: 'ri:error-warning-line',
      order: 3,
      color: 'orange',
      classNames: {
        rail: 'bg-orange-400',
        text: 'text-orange-300',
        border: 'border-orange-500/30',
        bg: 'bg-orange-500/5',
        bar: 'bg-orange-400',
      },
    },
    {
      id: 'CRITICAL',
      slug: 'critical',
      label: 'Critical',
      icon: 'ri:alarm-warning-line',
      order: 4,
      color: 'red',
      classNames: {
        rail: 'bg-red-500',
        text: 'text-red-300',
        border: 'border-red-500/30',
        bg: 'bg-red-500/[0.07]',
        bar: 'bg-red-500',
      },
    },
  ] as const satisfies IncidentSeverityInfo<IncidentSeverity>[]
)

type _ExpectToHaveAllValues = Assert<
  Equals<(typeof incidentSeverities)[number]['id'], IncidentSeverity>
>
