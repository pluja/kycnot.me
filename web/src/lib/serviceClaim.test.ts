/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { claimedUsernames, claimHosts, domainChangedHands, findClaimHost, recordName } from './serviceClaim'

test('claimHosts keeps homepage addresses on the service domain only', () => {
  assert.deepEqual(
    claimHosts([
      'https://www.Example.com/',
      'https://example.com',
      'http://shop.example.net',
      'https://t.me/examplebot',
      'https://bitcointalk.org/index.php?topic=1',
      'https://example.org/?ref=1',
      'http://abcdef.onion',
      'http://abcdef.i2p/',
      'https://203.0.113.5/',
      'https://[2001:db8::1]/',
      'https://localhost/',
      'ftp://example.com/',
      'https://someone.github.io/',
      'https://shop.duckdns.org/',
      'https://co.uk/',
      'not a url',
    ]),
    ['www.example.com', 'example.com', 'shop.example.net']
  )
})

test('claimedUsernames reads lists, several records and split chunks', () => {
  const usernames = claimedUsernames([
    ['kycnotme-verify=Alice, bob'],
    ['kycnotme-verify=car', 'ol'],
    ['v=spf1 -all'],
    ['other-verify=mallory'],
    ['KYCNOTME-VERIFY=dave eve'],
  ])
  assert.deepEqual([...usernames].sort(), ['alice', 'bob', 'carol', 'dave', 'eve'])
})

test('findClaimHost returns the first host listing the user and skips failing or aliased hosts', async () => {
  const records: Record<string, string[][]> = {
    'example.com': [['kycnotme-verify=someoneelse']],
    'www.example.com': [['kycnotme-verify=alice']],
    'cdn.example.com': [['kycnotme-verify=alice']],
  }
  const dns = {
    txt: (host: string) =>
      host in records ? Promise.resolve(records[host] ?? []) : Promise.reject(new Error('ENOTFOUND')),
    cname: (host: string) =>
      host === 'cdn.example.com'
        ? Promise.resolve(['tenant.hosting.example'])
        : Promise.reject(new Error('ENODATA')),
  }

  assert.equal(
    await findClaimHost(['broken.example', 'example.com', 'www.example.com'], 'Alice', dns),
    'www.example.com'
  )
  assert.equal(await findClaimHost(['cdn.example.com'], 'alice', dns), null)
  assert.equal(await findClaimHost(['example.com'], 'alice', dns), null)
  assert.equal(await findClaimHost([], 'alice', dns), null)
})

test('recordName is @ for the domain itself and the subdomain otherwise', () => {
  assert.equal(recordName('example.com'), '@')
  assert.equal(recordName('www.example.com'), 'www')
  assert.equal(recordName('shop.example.co.uk'), 'shop')
})

test('domainChangedHands only when a known registration follows the listing', () => {
  const listed = new Date('2025-01-01')
  assert.equal(domainChangedHands(new Date('2025-06-01'), listed), true)
  assert.equal(domainChangedHands(new Date('2020-06-01'), listed), false)
  assert.equal(domainChangedHands(null, listed), false)
  assert.equal(domainChangedHands(new Date('2025-06-01'), null), false)
})
