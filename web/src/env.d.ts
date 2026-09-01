/* eslint-disable @typescript-eslint/consistent-type-definitions */

import type { Capability } from './constants/capabilities'
import type { ErrorBanners } from './lib/errorBanners'
import type { ActionFormValues } from './lib/formReplay'
import type { KarmaUnlocks } from './lib/karmaUnlocks'
import type { Prisma } from '@prisma/client'
import type htmx from 'htmx.org'

declare global {
  namespace App {
    interface Locals {
      user: (Prisma.UserGetPayload<true> & { karmaUnlocks: KarmaUnlocks }) | null
      actualUser: (Prisma.UserGetPayload<true> & { karmaUnlocks: KarmaUnlocks }) | null
      apiKeyAuthenticated: boolean
      banners: ErrorBanners
      userCan: (capability: Capability) => boolean
      makeId: <T extends string>(prefix: T) => `${T}-${number}-${string}`
      // Values of a submitted form action, carried across the post-redirect-get
      // by the action session so pages can repopulate inputs without JS (see
      // getFormReplay). Null unless the current render follows a form action.
      actionFormValues: ActionFormValues | null
    }
  }

  interface Window {
    htmx?: typeof htmx
    __SW_REGISTRATION__?: ServiceWorkerRegistration
  }

  namespace PrismaJson {
    type TosReview = {
      kycLevel: 0 | 1 | 2 | 3 | 4
      /** Less than 200 characters */
      summary: MarkdownString
      contentHash: string
      complexity: 'high' | 'low' | 'medium'
      highlights: {
        /** Very short */
        title: string
        /** Short */
        content: MarkdownString
        rating: 'negative' | 'neutral' | 'positive'
        /** Absent on reviews generated before topics were introduced. */
        topic?: TosHighlightTopic
        /** The clause the highlight rests on, quoted from the source document. */
        evidence?: string
        /** The legal page the quoted clause came from. */
        sourceUrl?: string
      }[]
    }

    type TosHighlightTopic =
      | 'custody'
      | 'dataSharing'
      | 'disputes'
      | 'fundBlocking'
      | 'jurisdiction'
      | 'logging'
      | 'other'
      | 'refunds'
      | 'verification'

    type ProposedEdits = {
      /** sha256 hash of the legal corpus used to generate these edits. */
      contentHash: string
      /** Same shape as Service.tosReview, mirrored here for the admin UI. */
      tosReview: {
        kycLevel: 0 | 1 | 2 | 3 | 4
        summary: MarkdownString
        complexity: 'high' | 'low' | 'medium'
        highlights: {
          title: string
          content: MarkdownString
          rating: 'negative' | 'neutral' | 'positive'
          /** Absent on scans generated before topics were introduced. */
          topic?: TosHighlightTopic
          evidence?: string
          sourceUrl?: string
        }[]
      }
      kycPolicy: {
        /** Set while a level change is still open; null once declined or unchanged. */
        levelFingerprint?: string | null
        inferredLevel: 0 | 1 | 2 | 3 | 4
        notesMd: MarkdownString
        rationale: string
      }
      attributes: {
        add: ProposedAttribute[]
        remove: ProposedAttribute[]
      }
      /** Fields where the platform's record disagrees with the documents. */
      listingChecks?: {
        field: string
        /** What the platform records today. */
        current: string
        /** What the document says instead. */
        found: string
        quote: string
        sourceUrl: string
        /** The source document as ServiceLegalDocument keys it. */
        sourceUrlKey?: string
        fingerprint: string
      }[]
      warnings: {
        title: string
        bodyMd: MarkdownString
        severity: 'alert' | 'info' | 'warning'
      }[]
    }

    type ProposedAttribute = {
      attributeId: number
      rationale: string
      /** Absent on scans generated before proposals had to quote a clause. */
      quote?: string
      sourceUrl?: string
      /** Identity of this proposal, so declining it is remembered. */
      fingerprint?: string
      /** The source document as ServiceLegalDocument keys it. */
      sourceUrlKey?: string
    }

    type UserSentiment = {
      summary: MarkdownString
      sentiment: 'negative' | 'neutral' | 'positive'
      whatUsersLike: string[]
      whatUsersDislike: string[]
    }
  }
}

declare module '*.svg?raw' {
  const content: string
  export default content
}
