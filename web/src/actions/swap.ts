import { z } from 'astro:content'

import { defineProtectedAction } from '../lib/defineProtectedAction'
import {
  getAggregatedQuotesWithServices,
  type AggregatedResultWithService,
} from '../lib/exchange/aggregator'
import { bump } from '../lib/stats'

const REQUEST_MAX_WAIT_MS = 6_000

// Astro form fields arrive as null when absent and "" when empty. Both
// break z.coerce.number().positive().optional() (Number("") is 0, which
// fails positive). Normalize to undefined so .optional() fires.
const formNullish = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v == null || v === '' ? undefined : v), schema)

const inputSchema = z.object({
  from: z.string().toLowerCase().min(1),
  to: z.string().toLowerCase().min(1),
  sendAmount: formNullish(z.coerce.number().positive().finite().optional()),
  receiveAmount: formNullish(z.coerce.number().positive().finite().optional()),
  sortBy: formNullish(z.enum(['rate', 'score', 'kyc']).optional()).transform((v) => v ?? 'rate'),
  approvedOnly: formNullish(z.string().optional()).transform(
    (value) => value === 'true' || value === 'on' || value === '1'
  ),
})

export type SwapQuoteInput = z.infer<typeof inputSchema>

export const swapActions = {
  quote: defineProtectedAction({
    accept: 'form',
    permissions: 'guest',
    input: inputSchema,
    handler: async (input) => {
      // Drop both amounts when both are set; the aggregator otherwise
      // picks one arbitrarily and the user's intent is unclear.
      const bothSet = input.sendAmount !== undefined && input.receiveAmount !== undefined
      const sendAmount = bothSet ? undefined : input.sendAmount
      const receiveAmount = bothSet ? undefined : input.receiveAmount

      const cleanedInput = { ...input, sendAmount, receiveAmount }

      let result: AggregatedResultWithService[] = []
      let aggregatorUnavailable = false
      try {
        result = await getAggregatedQuotesWithServices({
          currencyFrom: input.from,
          currencyTo: input.to,
          sendAmount,
          receiveAmount,
          maxWaitMs: REQUEST_MAX_WAIT_MS,
        })
      } catch (error) {
        aggregatorUnavailable = true
        const e = error as { code?: unknown; details?: unknown; message?: unknown } | null
        if (e && typeof e.code === 'number') {
          console.error(`[swap] aggregator unavailable: gRPC code=${e.code} ${e.details ?? e.message ?? ''}`)
        } else {
          console.error('[swap] aggregator unavailable', error)
        }
      }

      void bump({
        kind: 'swap.quote-fetched',
        fromCurrency: input.from,
        toCurrency: input.to,
      }).catch(() => null)

      return {
        input: cleanedInput,
        result,
        aggregatorUnavailable,
      }
    },
  }),
}
