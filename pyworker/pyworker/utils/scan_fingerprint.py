"""
Stable identity for one scan proposal.

A reviewer's decision has to outlive the model's wording. The fingerprint
deliberately excludes the quoted clause: the model quotes the same clause with
different boundaries between runs, so a quote-based identity would let a
declined proposal return under a new fingerprint.

What lifts a decline instead is the corpus hash stored beside it. The documents
changing is detected deterministically, so a reviewer is asked again when the
service actually edits its terms and never merely because a sentence was quoted
differently.

The TypeScript side is web/src/lib/scanFingerprint.ts. Parity is covered by
tests/fixtures/scan_fingerprints.json, which both implementations run.
"""

import hashlib


def scan_fingerprint(service_id: int, kind: str, key: str) -> str:
    payload = "\n".join([str(service_id), kind.strip(), str(key).strip()])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
