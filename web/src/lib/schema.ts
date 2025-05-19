import { SITE_URL } from 'astro:env/client'

import type { Organization } from 'schema-dts'

export const KYCNOTME_SCHEMA_MINI = {
  '@type': 'Organization',
  name: 'KYCnot.me',
  sameAs: SITE_URL,
  url: SITE_URL,
} as const satisfies Organization
