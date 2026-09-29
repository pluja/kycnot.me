import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'

// Service URLs, ToS URLs and contact methods are left out on purpose: a swapped
// link reads as harmless in a diff, and one misclick would publish a scam
// address. Those changes go through the free-text reason and a manual edit.
type ServiceEditFieldInfo<T extends string | null | undefined = string> = {
  id: T
  label: string
  icon: string
  /** A list is compared as a set and applied as a delta, so it merges with edits made since. */
  kind: 'list' | 'text'
  /** Identity fields start unticked, so applying them is always a deliberate choice. */
  preselected: boolean
}

export const {
  dataArray: serviceEditFields,
  getFn: getServiceEditFieldInfo,
  zodEnumById: serviceEditFieldsZodEnumById,
} = makeHelpersForOptions(
  'id',
  (id): ServiceEditFieldInfo<typeof id> => ({
    id,
    label: id ?? 'Unknown field',
    icon: 'ri:question-line',
    kind: 'text',
    preselected: false,
  }),
  [
    { id: 'name', label: 'Name', icon: 'ri:text', kind: 'text', preselected: false },
    { id: 'description', label: 'Description', icon: 'ri:file-text-line', kind: 'text', preselected: false },
    {
      id: 'operatingSince',
      label: 'Operating since',
      icon: 'ri:calendar-line',
      kind: 'text',
      preselected: true,
    },
    {
      id: 'registeredCompanyName',
      label: 'Registered company',
      icon: 'ri:building-line',
      kind: 'text',
      preselected: true,
    },
    {
      id: 'registrationCountryCode',
      label: 'Registration country',
      icon: 'ri:flag-line',
      kind: 'text',
      preselected: true,
    },
    { id: 'kycLevel', label: 'KYC level', icon: 'ri:shield-user-line', kind: 'text', preselected: true },
    { id: 'categories', label: 'Categories', icon: 'ri:folder-line', kind: 'list', preselected: true },
    { id: 'attributes', label: 'Attributes', icon: 'ri:price-tag-3-line', kind: 'list', preselected: true },
    {
      id: 'acceptedCurrencies',
      label: 'Accepted currencies',
      icon: 'ri:coin-line',
      kind: 'list',
      preselected: true,
    },
  ] as const satisfies ServiceEditFieldInfo[]
)

type ServiceEditField = (typeof serviceEditFields)[number]
export type ServiceEditFieldId = ServiceEditField['id']
export type ServiceEditListFieldId = Extract<ServiceEditField, { kind: 'list' }>['id']
export type ServiceEditTextFieldId = Extract<ServiceEditField, { kind: 'text' }>['id']
