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

export function intersectAcceptedAttributeIds(
  inputIds: number[],
  proposed: AttributeProposal[]
): number[] {
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
  const acceptedAdd = intersectAcceptedAttributeIds(
    inputs.attributeAddIds,
    proposedAttributes.add
  )
  const acceptedRemove = intersectAcceptedAttributeIds(
    inputs.attributeRemoveIds,
    proposedAttributes.remove
  )

  const lines = ['Deep scan suggestion applied by admin', '']
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
