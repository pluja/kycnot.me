import { scanFingerprint } from '../../../lib/scanFingerprint'

type AttributeProposal = {
  attributeId: number
  rationale: string
}

type AcceptInputs = {
  acceptTosReview: boolean
  acceptKycLevel: boolean
  acceptKycPolicy: boolean
  attributeAddIds: number[]
  attributeRemoveIds: number[]
}

type ProposedAttributes = {
  add: AttributeProposal[]
  remove: AttributeProposal[]
}

export function intersectAcceptedAttributeIds(inputIds: number[], proposed: AttributeProposal[]): number[] {
  const proposedSet = new Set(proposed.map((p) => p.attributeId))
  return inputIds.filter((id) => proposedSet.has(id))
}

export function buildAuditLines({
  inputs,
  proposedAttributes,
  proposedKycLevel,
}: {
  inputs: AcceptInputs
  proposedAttributes: ProposedAttributes
  proposedKycLevel: number
}): string[] {
  const acceptedAdd = intersectAcceptedAttributeIds(inputs.attributeAddIds, proposedAttributes.add)
  const acceptedRemove = intersectAcceptedAttributeIds(inputs.attributeRemoveIds, proposedAttributes.remove)

  const lines = ['Deep scan suggestion applied', '']
  if (inputs.acceptTosReview) {
    lines.push('ToS review published')
  }
  if (inputs.acceptKycLevel) {
    lines.push(`KYC level set to ${proposedKycLevel.toString()}`)
  }
  if (inputs.acceptKycPolicy) {
    lines.push('KYC policy notes updated')
  }
  if (acceptedAdd.length > 0) {
    lines.push(`Added attributes: ${acceptedAdd.join(', ')}`)
  }
  if (acceptedRemove.length > 0) {
    lines.push(`Removed attributes: ${acceptedRemove.join(', ')}`)
  }
  if (lines.length === 2) {
    lines.push('No changes accepted')
  }
  return lines
}

type DeclineInputs = {
  serviceId: number
  declinedById: number
  proposed: PrismaJson.ProposedEdits
  /** Content hash of each tracked document, so a decline can name how its source read. */
  documentHashes: Map<string, string>
  acceptedAttributeAdd: number[]
  acceptedAttributeRemove: number[]
  acceptedListingFields: string[]
  acceptedKycLevel: boolean
}

/**
 * Rows for the proposals a reviewer left unticked.
 *
 * Leaving one unticked is a decision, and without recording it the next scan
 * raises the same item again. The fingerprint is computed here rather than read
 * from the payload so a hand-edited suggestion cannot bury an unrelated
 * proposal, and the corpus hash bounds the decision to the documents it was made
 * against.
 */
export function collectDeclines({
  serviceId,
  declinedById,
  proposed,
  documentHashes,
  acceptedAttributeAdd,
  acceptedAttributeRemove,
  acceptedListingFields,
  acceptedKycLevel,
}: DeclineInputs) {
  const accepted = {
    'attribute:add': new Set(acceptedAttributeAdd.map(String)),
    'attribute:remove': new Set(acceptedAttributeRemove.map(String)),
  }

  type DeclineRow = {
    serviceId: number
    declinedById: number
    sourceUrlKey: string | null
    sourceContentHash: string | null
    fingerprint: string
    kind: string
    label: string
  }

  // A decline lifts when its source document changes, so it has to record which
  // document and how that document read. Without one it never lifts.
  const source = (urlKey: string | undefined) => ({
    sourceUrlKey: urlKey || null,
    sourceContentHash: (urlKey && documentHashes.get(urlKey)) || null,
  })

  const rows: DeclineRow[] = (['attribute:add', 'attribute:remove'] as const).flatMap((kind) =>
    (kind === 'attribute:add' ? proposed.attributes.add : proposed.attributes.remove)
      .filter((item) => !accepted[kind].has(String(item.attributeId)))
      .map((item) => ({
        serviceId,
        declinedById,
        ...source(item.sourceUrlKey),
        fingerprint: scanFingerprint(serviceId, kind, item.attributeId),
        kind,
        label: `${kind === 'attribute:add' ? 'Add' : 'Remove'} attribute ${String(item.attributeId)}`,
      }))
  )

  const acceptedFields = new Set(acceptedListingFields)
  for (const check of proposed.listingChecks ?? []) {
    if (acceptedFields.has(check.field)) continue
    rows.push({
      serviceId,
      declinedById,
      ...source(check.sourceUrlKey),
      fingerprint: scanFingerprint(serviceId, 'listing', check.field),
      kind: 'listing',
      label: `${check.field}: keep ${check.current || '(not set)'} over ${check.found}`,
    })
  }

  // Keyed on the level, not the service: turning down a move to 3 leaves a later
  // move to 4 free to be proposed. It carries no source document, so it holds
  // until someone proposes that same level again.
  if (proposed.kycPolicy.levelFingerprint && !acceptedKycLevel) {
    rows.push({
      serviceId,
      declinedById,
      sourceUrlKey: null,
      sourceContentHash: null,
      fingerprint: scanFingerprint(serviceId, 'kycLevel', proposed.kycPolicy.inferredLevel),
      kind: 'kycLevel',
      label: `Keep the KYC level rather than moving it to ${String(proposed.kycPolicy.inferredLevel)}`,
    })
  }

  return rows
}
