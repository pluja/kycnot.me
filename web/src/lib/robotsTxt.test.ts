import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildRobotsTxt } from './robotsTxt'

const robots = buildRobotsTxt('https://kycnot.me/sitemaps/index.xml')

/** Splits into groups the way a crawler does: a run of User-agent lines plus its rules. */
function groups(body: string) {
  return body
    .split('\n\n')
    .filter((block) => block.includes('User-agent:'))
    .map((block) => {
      const lines = block.split('\n').filter((line) => !line.startsWith('#'))
      return {
        agents: lines
          .filter((line) => line.startsWith('User-agent:'))
          .map((line) => line.slice('User-agent:'.length).trim()),
        rules: lines.filter((line) => !line.startsWith('User-agent:')),
      }
    })
}

void test('every group that allows crawling carries identical rules', () => {
  // RFC 9309: a crawler obeys exactly one group and inherits nothing from `*`.
  // The named allow-groups previously drifted from the wildcard group and lost
  // the /swap parameter rules, which is what this pins.
  const allowing = groups(robots).filter((group) => group.rules.includes('Allow: /'))
  assert.ok(allowing.length >= 2, 'expected a named allow-group and the wildcard group')
  const wildcard = allowing.find((group) => group.agents.includes('*'))
  assert.ok(wildcard, 'wildcard group must exist')
  for (const group of allowing) {
    assert.deepEqual(group.rules, wildcard.rules, `group ${group.agents.join(',')} drifted from *`)
  }
})

void test('training crawlers are fully disallowed', () => {
  for (const agent of [
    'GPTBot',
    'ClaudeBot',
    'CCBot',
    'Amazonbot',
    'Meta-ExternalAgent',
    'Google-Extended',
  ]) {
    const group = groups(robots).find((candidate) => candidate.agents.includes(agent))
    assert.ok(group, `${agent} must be listed`)
    assert.deepEqual(group.rules, ['Disallow: /'], `${agent} must be fully blocked`)
  }
})

void test('answer engines are allowed, including the user-triggered fetchers', () => {
  for (const agent of [
    'OAI-SearchBot',
    'ChatGPT-User',
    'PerplexityBot',
    'Claude-SearchBot',
    'Claude-User',
    'Amzn-SearchBot',
  ]) {
    const group = groups(robots).find((candidate) => candidate.agents.includes(agent))
    assert.ok(group, `${agent} must be listed`)
    assert.ok(group.rules.includes('Allow: /'), `${agent} must be allowed`)
  }
})

void test('Bytespider gets a standalone group', () => {
  const group = groups(robots).find((candidate) => candidate.agents.includes('Bytespider'))
  assert.ok(group)
  assert.deepEqual(group.agents, ['Bytespider'], 'it is reported to skip grouped User-agent lines')
})

void test('a token is never both allowed and blocked', () => {
  const seen = new Set<string>()
  for (const group of groups(robots)) {
    for (const agent of group.agents) {
      assert.ok(!seen.has(agent), `${agent} appears in more than one group`)
      seen.add(agent)
    }
  }
})

void test('names the sitemap', () => {
  assert.ok(robots.includes('Sitemap: https://kycnot.me/sitemaps/index.xml'))
})
