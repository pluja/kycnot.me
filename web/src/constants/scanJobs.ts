/**
 * How long a claimed job may sit before it counts as abandoned by a dead
 * worker. Mirrors SERVICE_SCAN_CLAIM_TIMEOUT_MINUTES in the worker's config.
 */
export const SCAN_CLAIM_TIMEOUT_MS = 15 * 60 * 1000
