import { AsyncLocalStorage } from 'node:async_hooks'

const assetTracking = new AsyncLocalStorage<{ missing: boolean }>()

// trackMissingAssets runs render and reports whether anything inside it called
// reportMissingAsset. The flag lives in async context rather than a module
// variable because renders run concurrently.
export async function trackMissingAssets<T>(
  render: () => Promise<T>
): Promise<{ result: T; missingAssets: boolean }> {
  const state = { missing: false }
  const result = await assetTracking.run(state, render)
  return { result, missingAssets: state.missing }
}

// reportMissingAsset marks the surrounding render as one a retry could improve:
// an asset it wanted was unreadable, rather than absent by design. Callers that
// reject a source outright (private, foreign, malformed) must not report, since
// re-rendering those would produce the same picture forever. No-op outside a
// tracked render.
export function reportMissingAsset(): void {
  const state = assetTracking.getStore()
  if (state) {
    state.missing = true
  }
}
