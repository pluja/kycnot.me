/* eslint-disable @typescript-eslint/consistent-type-definitions */

import type { ErrorBanners } from './lib/errorBanners'
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
      makeId: <T extends string>(prefix: T) => `${T}-${number}-${string}`
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
      }[]
    }

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
        }[]
      }
      kycPolicy: {
        inferredLevel: 0 | 1 | 2 | 3 | 4
        notesMd: MarkdownString
        rationale: string
      }
      attributes: {
        add: { attributeId: number; rationale: string }[]
        remove: { attributeId: number; rationale: string }[]
      }
      warnings: {
        title: string
        bodyMd: MarkdownString
        severity: 'alert' | 'info' | 'warning'
      }[]
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
