import { Resolver } from 'node:dns/promises'
import { isIP } from 'node:net'

import { parse } from 'tldts'

import { CLAIM_RECORD_PREFIX } from '../constants/serviceClaim'

const RDAP_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json'
const RDAP_BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000
const LOOKUP_TIMEOUT_MS = 8000

// claimHosts lists the hosts whose DNS proves control of a service: only homepage addresses on the service's own
// domain count, since a page on a shared platform (t.me/bot, a forum thread) says nothing about who runs it. Hosts
// under a shared or dynamic DNS suffix (github.io, duckdns.org) are refused: their names get handed to strangers.
export function claimHosts(serviceUrls: string[]): string[] {
  const hosts = new Set<string>()
  for (const url of serviceUrls) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      continue
    }
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
    const isHomepage = (parsed.pathname === '' || parsed.pathname === '/') && !parsed.search
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !isHomepage ||
      !host.includes('.') ||
      isIP(host.replace(/^\[|\]$/g, '')) !== 0 ||
      host.endsWith('.onion') ||
      host.endsWith('.i2p') ||
      !registrableDomain(host) ||
      parse(host, { allowPrivateDomains: true }).isPrivate
    ) {
      continue
    }
    hosts.add(host)
    if (host.startsWith('www.')) hosts.add(host.slice(4))
  }
  return [...hosts]
}

function registrableDomain(host: string): string | null {
  return parse(host).domain
}

// recordName is the name a registrar's DNS editor wants for the host: @ for the domain itself, else its subdomain.
export function recordName(host: string): string {
  const { subdomain } = parse(host)
  return subdomain === null || subdomain === '' ? '@' : subdomain
}

// claimedUsernames reads every kycnotme-verify record on a host. One record may list several usernames, separated
// by commas or spaces, and a host may carry several records.
export function claimedUsernames(records: string[][]): Set<string> {
  const usernames = new Set<string>()
  for (const chunks of records) {
    const record = chunks.join('').trim()
    if (!record.toLowerCase().startsWith(CLAIM_RECORD_PREFIX)) continue
    for (const name of record.slice(CLAIM_RECORD_PREFIX.length).split(/[\s,]+/)) {
      if (name) usernames.add(name.toLowerCase())
    }
  }
  return usernames
}

type DnsLookup = {
  txt: (host: string) => Promise<string[][]>
  cname: (host: string) => Promise<string[]>
}

const resolver = new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 2 })
const systemDns: DnsLookup = {
  txt: (host) => resolver.resolveTxt(host),
  cname: (host) => resolver.resolveCname(host),
}

// findClaimHost is the first host whose own TXT records list the username. A host that is a CNAME is skipped: its TXT
// answer comes from whoever holds the target, which may be a hosting account anyone can open.
export async function findClaimHost(
  hosts: string[],
  username: string,
  dns: DnsLookup = systemDns
): Promise<string | null> {
  for (const host of hosts) {
    const aliases = await dns.cname(host).catch(() => [])
    if (aliases.length > 0) continue
    const records = await dns.txt(host).catch(() => null)
    if (records && claimedUsernames(records).has(username.toLowerCase())) return host
  }
  return null
}

// domainChangedHands is true when the domain was registered after the service was listed, so whoever holds it now
// may not be who ran the service when it was listed.
export function domainChangedHands(registeredAt: Date | null, listedAt: Date | null): boolean {
  return !!registeredAt && !!listedAt && registeredAt > listedAt
}

let rdapBootstrap: { fetchedAt: number; urlsByTld: Map<string, string[]> } | null = null

async function rdapBaseUrls(tld: string): Promise<string[]> {
  if (!rdapBootstrap || Date.now() - rdapBootstrap.fetchedAt > RDAP_BOOTSTRAP_TTL_MS) {
    const response = await fetch(RDAP_BOOTSTRAP_URL, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) })
    if (!response.ok) return []
    const body = (await response.json()) as { services?: [string[], string[]][] }
    const urlsByTld = new Map<string, string[]>()
    for (const [tlds, urls] of body.services ?? []) {
      for (const entry of tlds) urlsByTld.set(entry.toLowerCase(), urls)
    }
    rdapBootstrap = { fetchedAt: Date.now(), urlsByTld }
  }
  return rdapBootstrap.urlsByTld.get(tld) ?? []
}

// domainRegisteredAt asks the domain's registry over RDAP when it was registered. Null when the registry has no RDAP
// service or does not answer, which callers treat as unknown rather than as a change of hands.
export async function domainRegisteredAt(host: string): Promise<Date | null> {
  const domain = registrableDomain(host)
  const tld = domain?.split('.').at(-1)
  if (!domain || !tld) return null
  const baseUrls = await rdapBaseUrls(tld).catch(() => [])
  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/?$/, '/')}domain/${domain}`, {
        headers: { accept: 'application/rdap+json' },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      })
      if (!response.ok) continue
      const body = (await response.json()) as { events?: { eventAction?: string; eventDate?: string }[] }
      const registration = body.events?.find((event) => event.eventAction === 'registration')
      const date = registration?.eventDate ? new Date(registration.eventDate) : null
      if (date && !Number.isNaN(date.getTime())) return date
    } catch {
      continue
    }
  }
  return null
}
