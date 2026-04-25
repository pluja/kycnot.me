/* eslint-disable @typescript-eslint/no-empty-function */
import { startListener } from './lib/postgresListeners'

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
