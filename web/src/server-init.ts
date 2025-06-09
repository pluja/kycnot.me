/* eslint-disable @typescript-eslint/no-empty-function */
import { startListener } from './lib/postgresListeners'

await startListener({
  error: console.error,
  warn: console.warn,
  info: () => {},
  debug: () => {},
})
