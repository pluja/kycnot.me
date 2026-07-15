// LruByteCache evicts least-recently-used entries once the byte budget is
// exceeded. Entries above maxEntryBytes are rejected outright so a single
// large value can never flush the whole cache, which keeps cache-busting
// request floods (fresh keys per request) bounded to the budget.
export class LruByteCache<V> {
  private entries = new Map<string, { value: V; bytes: number }>()
  private totalBytes = 0

  constructor(
    private readonly maxTotalBytes: number,
    private readonly maxEntryBytes: number
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: V, bytes: number): void {
    if (bytes > this.maxEntryBytes) return
    const existing = this.entries.get(key)
    if (existing) {
      this.entries.delete(key)
      this.totalBytes -= existing.bytes
    }
    this.entries.set(key, { value, bytes })
    this.totalBytes += bytes
    for (const [oldestKey, oldest] of this.entries) {
      if (this.totalBytes <= this.maxTotalBytes) break
      this.entries.delete(oldestKey)
      this.totalBytes -= oldest.bytes
    }
  }

  get bytes(): number {
    return this.totalBytes
  }

  get size(): number {
    return this.entries.size
  }
}
