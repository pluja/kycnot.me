// Semaphore bounds concurrent async work with a bounded wait queue. run()
// returns null synchronously when the queue is full so callers can shed
// load (e.g. respond 503) instead of letting work pile up unbounded.
export class Semaphore {
  private active = 0
  private waiters: (() => void)[] = []

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number
  ) {}

  run<T>(work: () => Promise<T>): Promise<T> | null {
    if (this.active < this.maxConcurrent) return this.execute(work)
    if (this.waiters.length >= this.maxQueued) return null
    return new Promise<T>((resolve, reject) => {
      this.waiters.push(() => {
        this.execute(work).then(resolve, reject)
      })
    })
  }

  private async execute<T>(work: () => Promise<T>): Promise<T> {
    this.active++
    try {
      return await work()
    } finally {
      this.active--
      this.waiters.shift()?.()
    }
  }
}
