import { AttributeCategory, CommentStatus, EventType } from '@prisma/client'

import {
  AmountSide,
  QuoteError_Type,
  type QuoteError,
  type QuoteResult,
} from '../../generated/aggregator/v1/aggregator'
import { prisma } from '../prisma'

import { getQuotes as grpcGetQuotes } from './grpcClient'
import { safeHttpUrl } from './safeUrl'

import type { Prisma } from '@prisma/client'

export type AggregatorRequest = {
  currencyFrom: string
  currencyTo: string
  sendAmount?: number
  receiveAmount?: number
  /** Restrict the query to these provider slugs. Used by per-provider lazy-loading. */
  serviceSlugs?: string[]
  /** Per-call soft deadline. Separate from the gRPC client deadline; see grpcClient.ts. */
  maxWaitMs?: number
}

export type AggregatorResponse = {
  serviceSlug: string
} & (
  | {
      quote: {
        amountFrom: number
        currencyFrom: string
        currencyTo: string
        amountReceived: number
        exchangeRate: number
        minAmount: number | null
        maxAmount: number | null
        spreadPercent: number | null
        stale: boolean
        approximate: boolean
        /** Percent vs CoinPaprika mid; null when unavailable. */
        marketSpreadPercent: number | null
        deepLinkUrl: string
        orangefrenGuarantee: number | null
      }
      error: null
    }
  | {
      quote: null
      error: {
        message: string
        type: 'error' | 'unavailable'
        kind: UnavailableKind | 'other'
      }
    }
)

export type UnavailableKind = 'amount-too-high' | 'amount-too-low' | 'pair-unsupported'

const displayServiceSelect = {
  slug: true,
  name: true,
  imageUrl: true,
  overallScore: true,
  privacyScore: true,
  trustScore: true,
  kycLevel: true,
  kycPolicyMd: true,
  verificationStatus: true,
  serviceUrls: true,
  operatingSince: true,
  onionUrls: true,
  i2pUrls: true,
  registrationCountryCode: true,
  registeredCompanyName: true,
  averageUserRating: true,
  _count: {
    select: {
      comments: {
        where: {
          ratingActive: true,
          status: { in: [CommentStatus.APPROVED, CommentStatus.VERIFIED] },
          parentId: null,
          suspicious: false,
        },
      },
    },
  },
  attributes: {
    where: { attribute: { is: { category: AttributeCategory.KYC } } },
    select: {
      attribute: {
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          privacyPoints: true,
          trustPoints: true,
        },
      },
    },
  },
  events: {
    where: {
      visible: true,
      type: { in: [EventType.WARNING, EventType.ALERT] },
      OR: [{ endedAt: null }, { endedAt: { gte: new Date() } }],
    },
    orderBy: [{ startedAt: 'desc' }],
    select: {
      id: true,
      type: true,
      title: true,
      startedAt: true,
    },
    take: 3,
  },
} as const satisfies Prisma.ServiceSelect

type DisplayService = Prisma.ServiceGetPayload<{ select: typeof displayServiceSelect }>

export type AggregatedResultWithService = AggregatorResponse & {
  service: DisplayService | null
}

export async function getAggregatedQuotesWithServices(
  input: AggregatorRequest
): Promise<AggregatedResultWithService[]> {
  const { amount, amountSide } = resolveAmount(input)
  if (amount === null) return []
  // Short-circuit: the Go side rejects empty codes with an opaque gRPC error.
  if (!input.currencyFrom || !input.currencyTo) return []

  // Slugs come from the aggregator response, not a hardcoded list, so a new
  // provider surfaces automatically (slug-as-name) until the DB is seeded.
  const response = await grpcGetQuotes({
    currencyFrom: input.currencyFrom,
    currencyTo: input.currencyTo,
    amountSide,
    amount: amount.toString(),
    serviceSlugs: input.serviceSlugs ?? [],
    maxWaitMs: input.maxWaitMs ?? 0,
  })

  const slugs = response.results.map((r) => r.serviceSlug)
  const services =
    slugs.length === 0
      ? []
      : await prisma.service.findMany({
          where: { slug: { in: slugs } },
          select: displayServiceSelect,
        })

  const servicesBySlug = new Map(services.map((s) => [s.slug, s]))

  return response.results.map<AggregatedResultWithService>((r) => {
    const service = servicesBySlug.get(r.serviceSlug) ?? null
    const base = toAggregatorResponse(r, input)
    if (base.quote) {
      base.quote.deepLinkUrl = safeHttpUrl(base.quote.deepLinkUrl) ?? ''
    }
    return { ...base, service }
  })
}

function resolveAmount(input: AggregatorRequest): { amount: number | null; amountSide: AmountSide } {
  if (input.sendAmount !== undefined && input.sendAmount > 0) {
    return { amount: input.sendAmount, amountSide: AmountSide.AMOUNT_SIDE_SEND }
  }
  if (input.receiveAmount !== undefined && input.receiveAmount > 0) {
    return { amount: input.receiveAmount, amountSide: AmountSide.AMOUNT_SIDE_RECEIVE }
  }
  return { amount: null, amountSide: AmountSide.AMOUNT_SIDE_UNSPECIFIED }
}

function toAggregatorResponse(r: QuoteResult, input: AggregatorRequest): AggregatorResponse {
  if (r.quote) {
    const amountFrom = parseFiniteFloat(r.quote.amountFrom)
    const amountReceived = parseFiniteFloat(r.quote.amountReceived)
    const exchangeRate = parseFiniteFloat(r.quote.exchangeRate)
    return {
      serviceSlug: r.serviceSlug,
      quote: {
        amountFrom,
        currencyFrom: input.currencyFrom,
        currencyTo: input.currencyTo,
        amountReceived,
        exchangeRate,
        minAmount: parseOptionalNumber(r.quote.minAmount),
        maxAmount: parseOptionalNumber(r.quote.maxAmount),
        spreadPercent: parseFiniteFloat(r.quote.spreadPercent),
        stale: r.quote.stale,
        approximate: r.quote.approximate,
        marketSpreadPercent: parseOptionalNumber(r.quote.marketSpreadPercent),
        deepLinkUrl: r.quote.deepLinkUrl,
        orangefrenGuarantee: parseOptionalNumber(r.quote.orangefrenGuarantee),
      },
      error: null,
    }
  }
  if (r.error) {
    return {
      serviceSlug: r.serviceSlug,
      quote: null,
      error: {
        message: r.error.message,
        type: errorBucket(r.error),
        kind: errorKind(r.error),
      },
    }
  }
  return {
    serviceSlug: r.serviceSlug,
    quote: null,
    error: { message: 'Empty result', type: 'error', kind: 'other' },
  }
}

function parseFiniteFloat(raw: string | null | undefined): number {
  return parseOptionalNumber(raw) ?? 0
}

// Preserves the "unknown" vs "zero" distinction: the Go side sends "" when
// it couldn't compute the value (CoinPaprika unreachable, asset missing, ...).
function parseOptionalNumber(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function errorBucket(error: QuoteError): 'error' | 'unavailable' {
  switch (error.type) {
    case QuoteError_Type.TYPE_PAIR_UNSUPPORTED:
    case QuoteError_Type.TYPE_AMOUNT_TOO_LOW:
    case QuoteError_Type.TYPE_AMOUNT_TOO_HIGH:
      return 'unavailable'
    default:
      return 'error'
  }
}

function errorKind(error: QuoteError): UnavailableKind | 'other' {
  switch (error.type) {
    case QuoteError_Type.TYPE_PAIR_UNSUPPORTED:
      return 'pair-unsupported'
    case QuoteError_Type.TYPE_AMOUNT_TOO_LOW:
      return 'amount-too-low'
    case QuoteError_Type.TYPE_AMOUNT_TOO_HIGH:
      return 'amount-too-high'
    default:
      return 'other'
  }
}
