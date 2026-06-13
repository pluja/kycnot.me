import { SITE_URL } from 'astro:env/client'

import { socialLinks } from '../constants/socialLinks'

import type { Organization } from 'schema-dts'

export const KYCNOTME_SCHEMA_MINI = {
  '@type': 'Organization',
  name: 'KYCnot.me',
  url: SITE_URL,
  sameAs: socialLinks.map((social) => social.href),
} as const satisfies Organization
