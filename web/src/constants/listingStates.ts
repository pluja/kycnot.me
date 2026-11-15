import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

export const listingStateValues = [
  'LISTED',
  'AWAITING_REVIEW',
  'DECLINED',
  'CLOSED',
  'REMOVED',
  'ARCHIVED',
  'HIDDEN',
] as const

export type ListingState = (typeof listingStateValues)[number]

type ListingStateInfo<T extends string | null | undefined = string> = {
  value: T
  title: string
  description: string
  icon: string
  // scoreNote is set when nobody on the team stands behind the current scores: they are greyed out
  // and this short note says why. metaCaveat replaces the score in the meta description.
  scoreNote: string | null
  metaCaveat: string | null
  learnMoreHref: string | null
  classNames: {
    banner: string
    icon: string
    title: string
  }
}

export const { getFn: getListingStateInfo } = makeHelpersForOptions(
  'value',
  (value): ListingStateInfo<typeof value> => ({
    value,
    title: 'Not listed',
    description: "This service isn't in our directory.",
    icon: 'ri:question-line',
    scoreNote: 'Not listed',
    metaCaveat: "it isn't listed on KYCnot.me",
    learnMoreHref: null,
    classNames: {
      banner: 'border-day-500/20 bg-night-800',
      icon: 'text-day-400',
      title: 'text-day-200',
    },
  }),
  [
    {
      value: 'LISTED',
      title: 'Listed',
      description: 'This service is in our directory.',
      icon: 'ri:global-line',
      scoreNote: null,
      metaCaveat: null,
      learnMoreHref: null,
      classNames: {
        banner: 'border-green-500/30 bg-green-500/5',
        icon: 'text-green-400',
        title: 'text-green-300',
      },
    },
    {
      value: 'AWAITING_REVIEW',
      title: 'Not reviewed yet',
      description:
        "Suggested by a user. Our team hasn't checked it, and its scores are calculated from the attributes the user declared.",
      icon: 'ri:time-line',
      scoreNote: 'Not reviewed yet',
      metaCaveat: 'nobody at KYCnot.me has reviewed it yet',
      learnMoreHref: '/docs/listings',
      classNames: {
        banner: 'border-yellow-500/30 bg-yellow-500/5',
        icon: 'text-yellow-400',
        title: 'text-yellow-300',
      },
    },
    {
      value: 'DECLINED',
      title: 'Not listed',
      description:
        'Our team reviewed this suggestion and decided not to list it. Its scores are calculated from the attributes the user declared.',
      icon: 'ri:close-circle-line',
      scoreNote: 'Not listed',
      metaCaveat: 'KYCnot.me reviewed it and decided not to list it',
      learnMoreHref: null,
      classNames: {
        banner: 'border-red-500/30 bg-red-500/5',
        icon: 'text-red-400',
        title: 'text-red-300',
      },
    },
    {
      value: 'CLOSED',
      title: 'Not listed',
      description:
        'The suggestion was closed before our team reviewed it, usually because the site went down. Its scores are calculated from the attributes the user declared.',
      icon: 'ri:forbid-line',
      scoreNote: 'Not reviewed',
      metaCaveat: "KYCnot.me hasn't reviewed it",
      learnMoreHref: null,
      classNames: {
        banner: 'border-day-500/20 bg-night-800',
        icon: 'text-day-400',
        title: 'text-day-200',
      },
    },
    {
      value: 'REMOVED',
      title: 'Not listed',
      description: 'This service is no longer in our directory. Its scores may be out of date.',
      icon: 'ri:eye-off-line',
      scoreNote: 'Not listed anymore',
      metaCaveat: "it isn't listed on KYCnot.me anymore",
      learnMoreHref: null,
      classNames: {
        banner: 'border-day-500/20 bg-night-800',
        icon: 'text-day-400',
        title: 'text-day-200',
      },
    },
    {
      value: 'ARCHIVED',
      title: 'Archived',
      description: 'This service is no longer operating. Its information may be out of date.',
      icon: 'ri:archive-line',
      scoreNote: null,
      metaCaveat: null,
      learnMoreHref: null,
      classNames: {
        banner: 'border-day-500/20 bg-night-800',
        icon: 'text-day-400',
        title: 'text-day-200',
      },
    },
    {
      value: 'HIDDEN',
      title: 'Hidden',
      description: 'This page is hidden from the public. Only staff can see it.',
      icon: 'ri:lock-line',
      scoreNote: 'Hidden',
      metaCaveat: "it isn't public on KYCnot.me",
      learnMoreHref: null,
      classNames: {
        banner: 'border-red-500/20 bg-red-900/40',
        icon: 'text-red-400',
        title: 'text-red-300',
      },
    },
  ] as const satisfies ListingStateInfo<ListingState>[]
)
