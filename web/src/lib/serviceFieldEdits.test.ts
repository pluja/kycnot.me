import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyListFieldDelta,
  diffServiceFieldValues,
  serviceFieldValues,
  serviceFieldValuesFromForm,
  serviceUpdateFromFieldEdits,
  type ServiceFieldValues,
} from './serviceFieldEdits'

const service: ServiceFieldValues = {
  name: 'Example',
  description: 'Example is a swap service.',
  operatingSince: null,
  registeredCompanyName: null,
  registrationCountryCode: null,
  kycLevel: '2',
  categories: ['1', '2'],
  attributes: ['10'],
  acceptedCurrencies: ['MONERO', 'BITCOIN'],
}

void test('an untouched form proposes nothing, whatever order the lists come back in', () => {
  const resubmitted = {
    ...service,
    categories: ['2', '1'],
    acceptedCurrencies: ['BITCOIN', 'MONERO'],
  }
  assert.deepEqual(diffServiceFieldValues(service, resubmitted), [])
})

void test('only the changed fields are kept, with the value the person saw', () => {
  const edits = diffServiceFieldValues(service, { ...service, kycLevel: '0', attributes: ['10', '11'] })
  assert.deepEqual(edits, [
    { field: 'kycLevel', current: '2', proposed: '0' },
    { field: 'attributes', current: ['10'], proposed: ['10', '11'] },
  ])
})

void test('a list edit keeps entries added by someone else since it was suggested', () => {
  assert.deepEqual(
    applyListFieldDelta(['MONERO', 'BITCOIN', 'CASH'], {
      field: 'acceptedCurrencies',
      current: ['MONERO', 'BITCOIN'],
      proposed: ['MONERO', 'LIGHTNING'],
    }),
    ['MONERO', 'CASH', 'LIGHTNING']
  )
})

void test('relations are written as a delta against the live service', () => {
  const data = serviceUpdateFromFieldEdits(
    [
      { field: 'categories', current: ['1', '2'], proposed: ['2', '3'] },
      { field: 'operatingSince', current: null, proposed: '2020-05-01' },
    ],
    service
  )

  assert.deepEqual(data.categories, { connect: [{ id: 3 }], disconnect: [{ id: 1 }] })
  assert.deepEqual(data.operatingSince, new Date('2020-05-01'))
})

void test('a relation already removed by someone else is not removed twice', () => {
  const data = serviceUpdateFromFieldEdits(
    [{ field: 'attributes', current: ['10', '11'], proposed: ['10'] }],
    service
  )
  assert.deepEqual(data.attributes, { create: [], deleteMany: { attributeId: { in: [] } } })
})

void test('formatting noise in the record does not read as an edit', () => {
  const record = serviceFieldValues({
    name: 'Example',
    description: '  Example is a swap service.\n',
    operatingSince: null,
    registeredCompanyName: null,
    registrationCountryCode: null,
    kycLevel: 2,
    acceptedCurrencies: ['MONERO'],
    categories: [{ id: 1 }],
    attributes: [],
  })
  const submitted = serviceFieldValuesFromForm({
    name: 'Example',
    description: 'Example is a swap service.\r\n',
    registeredCompanyName: '',
    registrationCountryCode: '',
    kycLevel: 2,
    categories: [1],
    attributes: [],
    acceptedCurrencies: ['MONERO'],
  })
  assert.deepEqual(diffServiceFieldValues(record, submitted), [])
})

void test('a repeated id in the form is kept once', () => {
  const values = serviceFieldValuesFromForm({
    name: 'Example',
    description: 'Example is a swap service.',
    kycLevel: 2,
    categories: [1, 1],
    attributes: [5, 5],
    acceptedCurrencies: ['MONERO', 'MONERO'],
  })
  assert.deepEqual(
    [values.categories, values.attributes, values.acceptedCurrencies],
    [['1'], ['5'], ['MONERO']]
  )
})
