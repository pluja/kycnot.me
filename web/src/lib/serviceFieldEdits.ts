import { getServiceEditFieldInfo, serviceEditFields } from '../constants/serviceEditFields'

import type { ServiceEditListFieldId, ServiceEditTextFieldId } from '../constants/serviceEditFields'
import type { Currency, Prisma } from '@prisma/client'

type ServiceFieldEdit = PrismaJson.ServiceFieldEdits[number]
type ServiceListFieldEdit = Extract<ServiceFieldEdit, { current: string[] }>

export type ServiceFieldValues = Record<ServiceEditListFieldId, string[]> &
  Record<ServiceEditTextFieldId, string | null>

export const serviceEditableSelect = {
  name: true,
  description: true,
  operatingSince: true,
  registeredCompanyName: true,
  registrationCountryCode: true,
  kycLevel: true,
  acceptedCurrencies: true,
  categories: { select: { id: true } },
  attributes: { select: { attributeId: true } },
} as const satisfies Prisma.ServiceSelect

type EditableService = Prisma.ServiceGetPayload<{ select: typeof serviceEditableSelect }>

// Both sides of a diff go through the same normalization, or a form submitted
// untouched still differs from the record: browsers send textarea line breaks
// as CRLF, and the input is trimmed.
const normalizeText = (value: string) => value.replace(/\r\n/g, '\n').trim()
const unique = <T>(values: T[]) => [...new Set(values)]

export function serviceFieldValues(service: EditableService): ServiceFieldValues {
  return {
    name: normalizeText(service.name),
    description: normalizeText(service.description),
    operatingSince: service.operatingSince?.toISOString().slice(0, 10) ?? null,
    registeredCompanyName: service.registeredCompanyName
      ? normalizeText(service.registeredCompanyName)
      : service.registeredCompanyName,
    registrationCountryCode: service.registrationCountryCode,
    kycLevel: String(service.kycLevel),
    categories: service.categories.map((category) => String(category.id)),
    attributes: service.attributes.map((attribute) => String(attribute.attributeId)),
    acceptedCurrencies: service.acceptedCurrencies,
  }
}

export function serviceFieldValuesFromForm(input: {
  name: string
  description: string
  operatingSince?: Date
  registeredCompanyName?: string
  registrationCountryCode?: string | null
  kycLevel: number
  categories: number[]
  attributes: number[]
  acceptedCurrencies: Currency[]
}): ServiceFieldValues {
  return {
    name: normalizeText(input.name),
    description: normalizeText(input.description),
    operatingSince: input.operatingSince?.toISOString().slice(0, 10) ?? null,
    // An emptied input arrives as '', which means the value was cleared.
    registeredCompanyName: normalizeText(input.registeredCompanyName ?? '') || null,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    registrationCountryCode: input.registrationCountryCode || null,
    kycLevel: String(input.kycLevel),
    categories: unique(input.categories.map(String)),
    attributes: unique(input.attributes.map(String)),
    acceptedCurrencies: unique(input.acceptedCurrencies),
  }
}

export function isListFieldEdit(edit: ServiceFieldEdit): edit is ServiceListFieldEdit {
  return getServiceEditFieldInfo(edit.field).kind === 'list'
}

const sameList = (a: string[], b: string[]) => {
  const setA = new Set(a)
  const setB = new Set(b)
  return setA.size === setB.size && [...setA].every((value) => setB.has(value))
}

export function isSameFieldValue(a: string[] | string | null, b: string[] | string | null) {
  return Array.isArray(a) && Array.isArray(b) ? sameList(a, b) : a === b
}

export function diffServiceFieldValues(
  current: ServiceFieldValues,
  proposed: ServiceFieldValues
): PrismaJson.ServiceFieldEdits {
  return serviceEditFields.flatMap(({ id: field }): PrismaJson.ServiceFieldEdits => {
    const before = current[field]
    const after = proposed[field]
    if (isSameFieldValue(before, after)) return []
    return [{ field, current: before, proposed: after } as ServiceFieldEdit]
  })
}

export function listFieldDelta(edit: ServiceListFieldEdit) {
  return {
    added: edit.proposed.filter((value) => !edit.current.includes(value)),
    removed: edit.current.filter((value) => !edit.proposed.includes(value)),
  }
}

/**
 * Applies what the person added and removed to the list as it stands now, so
 * an entry someone else added since the suggestion is kept rather than
 * overwritten by the list the person saw.
 */
export function applyListFieldDelta(live: string[], edit: ServiceListFieldEdit) {
  const { added, removed } = listFieldDelta(edit)
  return [
    ...live.filter((value) => !removed.includes(value)),
    ...added.filter((value) => !live.includes(value)),
  ]
}

export function serviceUpdateFromFieldEdits(
  edits: PrismaJson.ServiceFieldEdits,
  live: ServiceFieldValues
): Prisma.ServiceUpdateInput {
  const data: Prisma.ServiceUpdateInput = {}

  for (const edit of edits) {
    if (isListFieldEdit(edit)) {
      const next = applyListFieldDelta(live[edit.field], edit)
      const toAdd = next.filter((value) => !live[edit.field].includes(value))
      const toRemove = live[edit.field].filter((value) => !next.includes(value))

      switch (edit.field) {
        case 'acceptedCurrencies':
          data.acceptedCurrencies = next as Currency[]
          break
        case 'categories':
          data.categories = {
            connect: toAdd.map((id) => ({ id: Number(id) })),
            disconnect: toRemove.map((id) => ({ id: Number(id) })),
          }
          break
        case 'attributes':
          data.attributes = {
            create: toAdd.map((id) => ({ attributeId: Number(id) })),
            deleteMany: { attributeId: { in: toRemove.map(Number) } },
          }
          break
      }
      continue
    }

    switch (edit.field) {
      case 'name':
      case 'description':
        if (edit.proposed) data[edit.field] = edit.proposed
        break
      case 'registeredCompanyName':
      case 'registrationCountryCode':
        data[edit.field] = edit.proposed
        break
      case 'operatingSince':
        data.operatingSince = edit.proposed ? new Date(edit.proposed) : null
        break
      case 'kycLevel':
        if (edit.proposed) data.kycLevel = Number(edit.proposed)
        break
    }
  }

  return data
}
