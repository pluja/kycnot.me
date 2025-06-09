import { startListener, stopListener } from './postgresListeners'

import type { AstroIntegration } from 'astro'

const INTEGRATION_NAME = 'postgres-listener'

export function postgresListener(): AstroIntegration {
  return {
    name: 'postgres-listener',
    hooks: {
      'astro:server:start': (options) => {
        const logger = options.logger.fork(INTEGRATION_NAME)
        void startListener(logger)
      },
      'astro:server:done': (options) => {
        const logger = options.logger.fork(INTEGRATION_NAME)
        void stopListener(logger)
      },
    },
  }
}
