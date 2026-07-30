import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { Assert } from '../lib/assert'
import type { TailwindColor } from '../lib/colors'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

/// EVENT_DISPLAY_KINDS are the shapes the event UI draws, collapsed from class +
/// sentiment. CHANGE is display-only: no moderator authors one, the edit pipeline
/// emits it.
export const EVENT_DISPLAY_KINDS = ['CHANGE', 'INFO', 'UPDATE', 'WARNING', 'ALERT', 'INCIDENT'] as const
export type EventDisplayKind = (typeof EVENT_DISPLAY_KINDS)[number]

type EventKindInfo<T extends string | null | undefined = string> = {
  id: T
  label: string
  /// Shown to readers as the badge tooltip, so it explains the tier in plain
  /// terms rather than describing the taxonomy.
  description: string
  classNames: {
    dot: string
    banner: string
    rail: string
    card: string
  }
  icon: string
  color: TailwindColor
  showBanner: boolean
  /// Severity rank. Highest wins when one entry has to represent a whole list.
  weight: number
}

export const { dataArray: eventKinds, getFn: getEventKindInfo } = makeHelpersForOptions(
  'id',
  (id): EventKindInfo<typeof id> => ({
    id,
    label: id ? transformCase(id, 'title') : String(id),
    description: 'An entry on this service record.',
    classNames: {
      dot: 'bg-night-500 text-day-300 ring-night-400/50',
      banner: 'bg-night-800/60 text-day-300 hover:bg-night-700/70 focus-visible:bg-night-700/70',
      rail: 'bg-night-400',
      card: 'border-day-800 bg-night-800/30',
    },
    icon: 'ri:question-fill',
    color: 'gray',
    showBanner: false,
    weight: 0,
  }),
  [
    {
      id: 'CHANGE',
      label: 'Listing edit',
      description: 'A detail on this listing was edited. No effect on the scores.',
      classNames: {
        dot: 'bg-night-500 text-day-400 ring-night-400/50',
        banner: 'bg-night-800/60 text-day-300 hover:bg-night-700/70 focus-visible:bg-night-700/70',
        rail: 'bg-night-400',
        card: 'border-day-800 bg-night-800/30',
      },
      icon: 'ri:pencil-fill',
      color: 'gray',
      showBanner: false,
      weight: 1,
    },
    {
      id: 'INFO',
      label: 'Information',
      description: 'Context worth knowing, with no bearing on how far to trust this service.',
      classNames: {
        dot: 'bg-sky-900 text-sky-300 ring-sky-900/50',
        banner: 'bg-sky-900/50 text-sky-300 hover:bg-sky-800/60 focus-visible:bg-sky-800/60',
        rail: 'bg-sky-800',
        card: 'border-sky-500/20 bg-sky-950/15',
      },
      icon: 'ri:information-fill',
      color: 'sky',
      showBanner: false,
      weight: 2,
    },
    {
      id: 'UPDATE',
      label: 'Update',
      description: "A change in users' favour, such as a fixed problem or an improved policy.",
      classNames: {
        dot: 'bg-green-900 text-green-300 ring-green-900/50',
        banner: 'bg-green-900/50 text-green-300 hover:bg-green-800/60 focus-visible:bg-green-800/60',
        rail: 'bg-green-800',
        card: 'border-green-500/20 bg-green-950/15',
      },
      icon: 'ri:arrow-up-circle-fill',
      color: 'green',
      showBanner: false,
      weight: 3,
    },
    {
      id: 'WARNING',
      label: 'Warning',
      description: 'Something to weigh before using this service, short of a confirmed failure.',
      classNames: {
        dot: 'bg-amber-900 text-amber-300 ring-amber-900/50',
        banner: 'bg-amber-900/50 text-amber-200 hover:bg-amber-800/60 focus-visible:bg-amber-800/60',
        rail: 'bg-amber-800',
        card: 'border-amber-500/25 bg-amber-950/15',
      },
      icon: 'ri:alert-fill',
      color: 'amber',
      showBanner: true,
      weight: 4,
    },
    {
      // Transitional tier for negative entries a moderator marked severe under the
      // legacy `type` column but that were never triaged into an Incident. Delete
      // the kind and its branch in eventToDisplayKind once no rows resolve to it.
      id: 'ALERT',
      label: 'Alert',
      description: 'A serious problem that has not been filed as a scored incident yet.',
      classNames: {
        dot: 'bg-red-900 text-red-300 ring-red-900/50',
        banner: 'bg-red-900/50 text-red-300 hover:bg-red-800/60 focus-visible:bg-red-800/60',
        rail: 'bg-red-800',
        card: 'border-red-500/25 bg-red-950/15',
      },
      icon: 'ri:alarm-warning-fill',
      color: 'red',
      showBanner: true,
      weight: 5,
    },
    {
      id: 'INCIDENT',
      label: 'Incident',
      description: 'A confirmed failure that cost users money, funds or privacy. Penalises the trust score.',
      classNames: {
        dot: 'bg-red-900 text-red-300 ring-red-900/50',
        banner: 'bg-red-900/50 text-red-300 hover:bg-red-800/60 focus-visible:bg-red-800/60',
        rail: 'bg-red-800',
        card: 'border-red-500/30 bg-red-950/20',
      },
      icon: 'ri:spam-fill',
      color: 'red',
      showBanner: true,
      weight: 6,
    },
  ] as const satisfies EventKindInfo<EventDisplayKind>[]
)

type _ExpectToHaveAllValues = Assert<Equals<(typeof eventKinds)[number]['id'], EventDisplayKind>>

/// resolvedEventClassNames replace a kind's own classes once the entry has
/// closed, so a past warning reads as history instead of an active flag.
export const resolvedEventClassNames = {
  dot: 'bg-night-500 text-green-300 ring-green-900/40',
  banner: 'bg-night-800/60 text-day-300 hover:bg-night-700/70 focus-visible:bg-night-700/70',
  rail: 'bg-green-900',
  card: 'border-day-800 bg-night-800/30',
} as const satisfies EventKindInfo['classNames']
