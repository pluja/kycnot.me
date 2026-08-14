// memoizeAsync runs compute at most once and hands every caller the same
// result. Concurrent callers share the single in-flight promise rather than
// starting a second run. A rejection is not kept, so the next call retries.
export function memoizeAsync<T>(compute: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return async () => {
    pending ??= compute().catch((error: unknown) => {
      pending = null
      throw error
    })
    return await pending
  }
}
