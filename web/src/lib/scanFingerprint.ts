import { createHash } from 'node:crypto'

/**
 * Stable identity for one scan proposal.
 *
 * A reviewer's decision has to outlive the model's wording. The fingerprint
 * deliberately excludes the quoted clause: the model quotes the same clause with
 * different boundaries between runs, so a quote-based identity would let a
 * declined proposal return under a new fingerprint.
 *
 * What lifts a decline instead is the corpus hash stored beside it. The
 * documents changing is detected deterministically, so a reviewer is asked again
 * when the service actually edits its terms and never merely because a sentence
 * was quoted differently.
 *
 * The Python side is pyworker/pyworker/utils/scan_fingerprint.py. Parity is
 * covered by pyworker/tests/fixtures/scan_fingerprints.json, which both
 * implementations run.
 */
export function scanFingerprint(serviceId: number, kind: string, key: number | string) {
  const payload = [String(serviceId), kind.trim(), String(key).trim()].join('\n')
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}
