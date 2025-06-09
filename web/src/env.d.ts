/* eslint-disable @typescript-eslint/consistent-type-definitions */

import type { ErrorBanners } from './lib/errorBanners'
import type { KarmaUnlocks } from './lib/karmaUnlocks'
import type { Prisma } from '@prisma/client'
import type * as htmx from 'htmx.org'

declare global {
  namespace App {
    interface Locals {
      user: (Prisma.UserGetPayload<true> & { karmaUnlocks: KarmaUnlocks }) | null
      actualUser: (Prisma.UserGetPayload<true> & { karmaUnlocks: KarmaUnlocks }) | null
      banners: ErrorBanners
      makeId: <T extends string>(prefix: T) => `${T}-${number}-${string}`
    }
  }

  interface Window {
    htmx?: typeof htmx
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

    type UserSentiment = {
      summary: MarkdownString
      sentiment: 'negative' | 'neutral' | 'positive'
      whatUsersLike: string[]
      whatUsersDislike: string[]
    }
  }
}
