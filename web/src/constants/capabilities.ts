import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

type CapabilityInfo<T extends string | null | undefined = string> = {
  value: T
  slug: string
  label: string
  description: string
  icon: string
}

export const {
  dataArray: capabilities,
  dataObject: capabilitiesByValue,
  getFn: getCapabilityInfo,
  zodEnumById: capabilitiesZodEnum,
} = makeHelpersForOptions(
  'value',
  (value): CapabilityInfo<typeof value> => ({
    value,
    slug: value ? value.replace(':', '-') : '',
    label: value ?? 'Unknown capability',
    description: '',
    icon: 'ri:shield-keyhole-line',
  }),
  [
    {
      value: 'cases:manage',
      slug: 'cases-manage',
      label: 'Manage cases',
      description:
        'Create, edit and resolve service cases: blocked funds, KYC demands, non-payment and similar reports.',
      icon: 'ri:scales-3-line',
    },
    {
      value: 'comments:moderate',
      slug: 'comments-moderate',
      label: 'Moderate comments',
      description: 'Approve, reject and moderate user comments and ratings.',
      icon: 'ri:chat-check-line',
    },
    {
      value: 'contact:manage',
      slug: 'contact-manage',
      label: 'Manage contact queue',
      description: 'Read and triage messages from the contact form.',
      icon: 'ri:mail-line',
    },
    {
      value: 'services:edit',
      slug: 'services-edit',
      label: 'Edit services',
      description:
        'Create and edit service listings, events, verification steps, ToS highlights, evidence and contact methods. Excludes the final approve/verify decision.',
      icon: 'ri:box-3-line',
    },
    {
      value: 'services:approve',
      slug: 'services-approve',
      label: 'Approve / verify services',
      description: "Set a service's verification status (approved, verified, scam).",
      icon: 'ri:verified-badge-line',
    },
    {
      value: 'attributes:manage',
      slug: 'attributes-manage',
      label: 'Manage attributes',
      description: 'Create and edit service attributes.',
      icon: 'ri:price-tag-3-line',
    },
    {
      value: 'suggestions:manage',
      slug: 'suggestions-manage',
      label: 'Review suggestions',
      description: 'Review and act on community service suggestions.',
      icon: 'ri:lightbulb-line',
    },
    {
      value: 'users:manage',
      slug: 'users-manage',
      label: 'Manage users',
      description: 'Edit user profiles, service affiliations and notes. Excludes promoting users or granting capabilities.',
      icon: 'ri:user-settings-line',
    },
    {
      value: 'announcements:manage',
      slug: 'announcements-manage',
      label: 'Manage announcements',
      description: 'Create and edit site announcements.',
      icon: 'ri:megaphone-line',
    },
    {
      value: 'notifications:manage',
      slug: 'notifications-manage',
      label: 'Manage notifications',
      description: 'Send and manage admin notifications.',
      icon: 'ri:notification-3-line',
    },
    {
      value: 'stats:view',
      slug: 'stats-view',
      label: 'View stats',
      description: 'View platform statistics.',
      icon: 'ri:bar-chart-2-line',
    },
  ] as const,
)

export type Capability = (typeof capabilities)[number]['value']
