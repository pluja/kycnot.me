/* eslint-disable @typescript-eslint/no-empty-function */
import { cleanupCommentEvidenceFiles } from './lib/commentEvidenceCleanup'
import { startListener } from './lib/postgresListeners'

setInterval(() => {
  void cleanupCommentEvidenceFiles().catch((error: unknown) => {
    console.error('Evidence cleanup failed', error)
  })
}, 60_000).unref()

const exitOnSignal = (signal: NodeJS.Signals) => {
  process.on(signal, () => process.exit(0))
}
exitOnSignal('SIGTERM')
exitOnSignal('SIGINT')

await startListener({
  error: console.error,
  warn: console.warn,
  info: () => {},
  debug: () => {},
})
