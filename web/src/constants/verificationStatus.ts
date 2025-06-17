import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

import type { MarkdownString } from '../lib/markdown'
import type { VerificationStatus } from '@prisma/client'

type VerificationStatusInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  labelShort: string
  label: string
  icon: string
  default: boolean
  description: string
  privacyPoints: number
  trustPoints: number
  classNames: {
    icon: string
    badgeBig: string
    button: string
    description: string
    containerBg: string
  }
  order: number
  verbPast: string
}

export const READ_MORE_SENTENCE_LINK =
  'Read more about the [listing statuses](/about#listing-statuses).' satisfies MarkdownString

export const {
  dataArray: verificationStatuses,
  dataObject: verificationStatusesByValue,
  getFn: getVerificationStatusInfo,
  getFnSlug: getVerificationStatusInfoBySlug,
  zodEnumBySlug: verificationStatusesZodEnumBySlug,
  zodEnumById: verificationStatusesZodEnumById,
  keyToSlug: verificationStatusIdToSlug,
  slugToKey: verificationStatusSlugToId,
} = makeHelpersForOptions(
  'value',
  (value): VerificationStatusInfo<typeof value> => ({
    value,
    slug: value ? value.toLowerCase() : '',
    labelShort: value ? transformCase(value, 'title') : String(value),
    label: value ? transformCase(value, 'title') : String(value),
    icon: 'ri:loader-line',
    default: false,
    description: '',
    privacyPoints: 0,
    trustPoints: 0,
    classNames: {
      icon: 'text-current',
      badgeBig: 'bg-night-400 text-day-100',
      button: 'bg-night-400 hover:bg-night-300',
      description: 'text-day-200',
      containerBg: 'bg-night-600',
    },
    order: Infinity,
    verbPast: value ? transformCase(value, 'title') : String(value),
  }),
  [
    {
      value: 'VERIFICATION_SUCCESS',
      slug: 'verified',
      labelShort: 'Verified',
      label: 'Verified',
      icon: 'ri:verified-badge-fill',
      default: true,
      description:
        'Thoroughly tested and verified by the team. But things might change, this is not a guarantee.',
      privacyPoints: 0,
      trustPoints: 10,
      classNames: {
        icon: 'text-[#40e6c2]',
        badgeBig: 'bg-green-800/50 text-green-100',
        button: 'bg-green-700 hover:bg-green-600',
        description: 'text-green-200',
        containerBg: 'bg-green-900/30',
      },
      order: 1,
      verbPast: 'verified',
    },
    {
      value: 'APPROVED',
      slug: 'approved',
      labelShort: 'Approved',
      label: 'Approved',
      icon: 'ri:check-line',
      default: true,
      description:
        'Everything checks out at first glance, but not verified nor thoroughly tested by the team.',
      privacyPoints: 0,
      trustPoints: 5,
      classNames: {
        icon: 'text-white',
        badgeBig: 'bg-night-400 text-day-100',
        button: 'bg-night-400 hover:bg-night-300',
        description: 'text-day-200',
        containerBg: 'bg-night-600',
      },
      order: 2,
      verbPast: 'approved',
    },
    {
      value: 'COMMUNITY_CONTRIBUTED',
      slug: 'community',
      labelShort: 'Community',
      label: 'Community Contributed',
      icon: 'ri:question-line',
      default: false,
      description: 'Suggested by the community, but not reviewed by the team yet.',
      privacyPoints: 0,
      trustPoints: 0,
      classNames: {
        icon: 'text-yellow-400',
        badgeBig: 'bg-amber-800/50 text-amber-100',
        button: 'bg-amber-700 hover:bg-amber-600',
        description: 'text-amber-200',
        containerBg: 'bg-amber-900/30',
      },
      order: 3,
      verbPast: 'contributed by the community',
    },
    {
      value: 'VERIFICATION_FAILED',
      slug: 'scam',
      labelShort: 'Scam',
      label: 'Scam',
      icon: 'ri:alert-fill',
      default: false,
      description: 'Confirmed as a SCAM or not what it claims to be.',
      privacyPoints: 0,
      trustPoints: -30,
      classNames: {
        icon: 'text-red-500',
        badgeBig: 'bg-red-800/50 text-red-100',
        button: 'bg-red-700 hover:bg-red-600',
        description: 'text-red-200',
        containerBg: 'bg-red-900/30',
      },
      order: 4,
      verbPast: 'marked as a SCAM',
    },
  ] as const satisfies VerificationStatusInfo<VerificationStatus>[]
)
