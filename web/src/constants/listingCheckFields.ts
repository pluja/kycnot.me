import { z } from 'astro/zod'

import { countriesZodEnumByCode } from './countries'

/**
 * The record fields a scan may compare against a service's documents.
 *
 * Which fields are compared is decided in pyworker (LISTING_CHECK_FIELDS in
 * database.py). This list is what the site is willing to write, and it is
 * deliberately not derived from the scan: a proposal names its own field, and
 * that name reaches us from a model reading pages the audited service publishes.
 * A field absent here still renders under its own name for review, so an
 * addition in pyworker is visible rather than silently dropped, but it cannot be
 * written until it is named here too.
 */
export const listingCheckFieldIds = ['registrationCountryCode', 'registeredCompanyName'] as const

export type ListingCheckFieldId = (typeof listingCheckFieldIds)[number]

export function isListingCheckFieldId(field: string): field is ListingCheckFieldId {
  return (listingCheckFieldIds as readonly string[]).includes(field)
}

export const listingCheckFieldLabels: Record<ListingCheckFieldId, string> = {
  registrationCountryCode: 'Registration country',
  registeredCompanyName: 'Registered company',
}

/**
 * What each field will accept, matching what the same field accepts when a
 * person edits it.
 *
 * A scan proposes the value it read out of a document, so a country arrives
 * written however that document wrote it while the column holds two characters.
 * Applying a proposal is a write like any other and is held to the same rules.
 */
export const listingCheckFieldSchemas: Record<ListingCheckFieldId, z.ZodType<string>> = {
  registrationCountryCode: countriesZodEnumByCode,
  registeredCompanyName: z.string().trim().min(1).max(100),
}
