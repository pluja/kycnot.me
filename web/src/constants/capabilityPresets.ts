import type { Capability } from './capabilities'

// One-click capability bundles for the grant UI. Selecting a preset ticks its
// capabilities; it is not stored, only the resulting capabilities are.
export const capabilityPresets = [
  {
    id: 'support',
    label: 'Support',
    icon: 'ri:customer-service-2-line',
    capabilities: [
      'services:edit',
      'comments:moderate',
      'contact:manage',
      'attributes:manage',
      'suggestions:manage',
      'users:manage',
      'announcements:manage',
      'notifications:manage',
      'stats:view',
    ],
  },
  {
    id: 'comments-moderator',
    label: 'Comments moderator',
    icon: 'ri:chat-check-line',
    capabilities: ['comments:moderate'],
  },
  {
    id: 'cases-manager',
    label: 'Cases manager',
    icon: 'ri:scales-3-line',
    capabilities: ['cases:manage'],
  },
] as const satisfies { id: string; label: string; icon: string; capabilities: Capability[] }[]
