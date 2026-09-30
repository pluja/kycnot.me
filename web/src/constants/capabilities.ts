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
      description: 'Create, edit and resolve service cases.',
      icon: 'ri:scales-3-line',
    },
    {
      value: 'comments:moderate',
      slug: 'comments-moderate',
      label: 'Moderate comments',
      description: 'Approve, reject and moderate comments and ratings.',
      icon: 'ri:chat-check-line',
    },
    {
      value: 'contact:manage',
      slug: 'contact-manage',
      label: 'Manage contact queue',
      description: 'Read and triage contact form messages.',
      icon: 'ri:mail-line',
    },
    {
      value: 'contact:manage-urgent',
      slug: 'contact-manage-urgent',
      label: 'Manage urgent reports',
      description: 'Read and triage urgent service reports only.',
      icon: 'ri:alarm-warning-line',
    },
    {
      value: 'services:edit',
      slug: 'services-edit',
      label: 'Edit services',
      description: 'Edit listings, verification steps and ToS highlights.',
      icon: 'ri:box-3-line',
    },
    {
      value: 'events:manage',
      slug: 'events-manage',
      label: 'Manage events',
      description: 'Create, edit, hide and delete service events.',
      icon: 'ri:calendar-event-line',
    },
    {
      value: 'services:approve',
      slug: 'services-approve',
      label: 'Approve / verify services',
      description: "Set a service's status: approved, verified or scam.",
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
      description: 'Review and act on community suggestions.',
      icon: 'ri:lightbulb-line',
    },
    {
      value: 'suggestions:self-apply',
      slug: 'suggestions-self-apply',
      label: 'Apply own edits',
      description: 'Apply own edit suggestions without a second reviewer.',
      icon: 'ri:user-follow-line',
    },
    {
      value: 'audit:read',
      slug: 'audit-read',
      label: 'Read the audit log',
      description: 'See who changed what across the site.',
      icon: 'ri:history-line',
    },
    {
      value: 'users:manage',
      slug: 'users-manage',
      label: 'Manage users',
      description: 'Edit profiles, affiliations and notes. No role grants.',
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
  ] as const
)

export type Capability = (typeof capabilities)[number]['value']

// Capabilities that only make sense alongside others. userCan ignores a grant
// whose requirements are not all held, so an orphan grant never does anything.
export const capabilityRequirements: Partial<Record<Capability, readonly Capability[]>> = {
  'suggestions:self-apply': ['suggestions:manage'],
}
