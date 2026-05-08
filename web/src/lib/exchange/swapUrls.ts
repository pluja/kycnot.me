export const SWAP_OOB_TARGETS =
  '#swap-page-heading,#swap-page-description,#swap-currency-from,#swap-currency-to,#swap-popular-pairs,#swap-flip,#swap-sort-state,#swap-approved-only-state'

// Only the flip action also rewrites the amount inputs; live typing must
// not, or an in-flight response would stomp on the character the user just
// typed.
export const SWAP_OOB_TARGETS_WITH_AMOUNTS = `${SWAP_OOB_TARGETS},#swap-send,#swap-receive`

export const SWAP_RESULTS_TARGET = '#swap-results'

export type SwapAmountOpts = {
  sendAmount?: number
  receiveAmount?: number
  sortBy?: 'kyc' | 'rate' | 'score'
  approvedOnly?: boolean
}

/** sendAmount and receiveAmount are mutually exclusive; sendAmount wins if both are set. */
export function buildSwapUrl(from: string, to: string, opts: SwapAmountOpts = {}): string {
  const params = new URLSearchParams()
  params.set('from', from)
  params.set('to', to)
  if (opts.sendAmount !== undefined) {
    params.set('sendAmount', String(opts.sendAmount))
  } else if (opts.receiveAmount !== undefined) {
    params.set('receiveAmount', String(opts.receiveAmount))
  }
  if (opts.sortBy && opts.sortBy !== 'rate') {
    params.set('sortBy', opts.sortBy)
  }
  if (opts.approvedOnly) {
    params.set('approvedOnly', 'true')
  }
  return `/swap?${params.toString()}`
}
