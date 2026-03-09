/**
 * Scans the database for services with malicious or invalid data introduced
 * via attacks on the /_image endpoint or file upload abuse. Reports findings
 * and optionally removes/fixes bad entries.
 *
 * Usage:
 *   npx tsx scripts/cleanup-malicious-data.ts           # dry run (report only)
 *   npx tsx scripts/cleanup-malicious-data.ts --fix     # apply fixes
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DRY_RUN = !process.argv.includes('--fix')

const SAFE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.avif', '.webp', '.gif', '.svg'])
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^::1$/,
  /^0\.0\.0\.0$/,
]

// Matches mangled http/https prefixes like "httpa://", "htp://", "https//", "htpps://"
const MANGLED_PROTOCOL_RE = /^([a-zA-Z]{2,10})([:\/]+)(.*)/

type UrlFinding = {
  value: string
  reason: string
  fix: string | null  // corrected URL if fixable, null if should be removed
}

type Finding = {
  serviceId: number
  slug: string
  field: string
} & UrlFinding

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))
}

/**
 * Attempts to correct a mangled protocol typo.
 * Returns the corrected URL string, or null if it cannot be safely fixed.
 */
function tryFixProtocol(url: string): string | null {
  const match = MANGLED_PROTOCOL_RE.exec(url)
  if (!match) return null

  const proto = match[1] ?? ''
  const rest = match[3] ?? ''

  // Determine correct protocol from hostname hints
  const hostname = rest.split('/')[0] ?? ''
  let correctProtocol: string

  if (hostname.endsWith('.onion')) {
    correctProtocol = 'http'
  } else if (hostname.endsWith('.i2p')) {
    correctProtocol = 'http'
  } else {
    correctProtocol = 'https'
  }

  // Only fix if the mangled proto looks like a typo of http/https
  // (contains mostly the right letters, not something like "javascript" or "file")
  const normalized = proto.toLowerCase().replace(/[^a-z]/g, '')
  const looksLikeHttp =
    normalized.startsWith('ht') ||
    normalized === 'htp' ||
    normalized === 'htps' ||
    normalized === 'hpps' ||
    normalized === 'htpp'

  if (!looksLikeHttp) return null

  const corrected = `${correctProtocol}://${rest}`

  // Validate the corrected URL is parseable and safe
  try {
    const parsed = new URL(corrected)
    if (isPrivateHost(parsed.hostname)) return null
    return corrected
  } catch {
    return null
  }
}

function checkImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null
  if (!imageUrl.startsWith('/files/')) return `external image URL not under /files/: ${imageUrl}`
  const ext = path.extname(imageUrl).toLowerCase()
  if (!SAFE_IMAGE_EXTENSIONS.has(ext)) return `non-image file extension: ${ext || '(none)'}`
  return null
}

function checkUrls(urls: string[]): UrlFinding[] {
  const findings: UrlFinding[] = []

  for (const url of urls) {
    try {
      const parsed = new URL(url)

      if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        findings.push({
          value: url,
          reason: `disallowed protocol: ${parsed.protocol}`,
          fix: null,
        })
        continue
      }

      if (isPrivateHost(parsed.hostname)) {
        findings.push({ value: url, reason: `private/internal host: ${parsed.hostname}`, fix: null })
      }
    } catch {
      // URL failed to parse — try to fix the protocol
      const fixed = tryFixProtocol(url)
      findings.push({
        value: url,
        reason: `invalid URL (unparseable)`,
        fix: fixed,
      })
    }
  }

  return findings
}

async function checkFileExists(imageUrl: string): Promise<boolean> {
  const uploadDir = process.env.UPLOAD_DIR ?? './local_uploads'
  const basePath = path.isAbsolute(uploadDir) ? uploadDir : path.join(process.cwd(), uploadDir)
  const relativePath = imageUrl.replace(/^\/files\//, '')
  const fullPath = path.normalize(path.join(basePath, relativePath))
  if (!fullPath.startsWith(basePath)) return false
  try {
    await fs.access(fullPath)
    return true
  } catch {
    return false
  }
}

function fixUrlArray(urls: string[], findings: UrlFinding[]): string[] {
  const findingByValue = new Map(findings.map((f) => [f.value, f]))
  return urls.flatMap((url) => {
    const finding = findingByValue.get(url)
    if (!finding) return [url]          // no issue
    if (finding.fix) return [finding.fix] // replace with corrected URL
    return []                            // remove
  })
}

async function main() {
  console.log(`\n🔍 Scanning database for malicious/invalid data...`)
  console.log(DRY_RUN ? '   Mode: DRY RUN (use --fix to apply changes)\n' : '   Mode: FIX\n')

  const services = await prisma.service.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      imageUrl: true,
      serviceUrls: true,
      tosUrls: true,
      onionUrls: true,
      i2pUrls: true,
      createdAt: true,
    },
  })

  console.log(`   Found ${services.length} services to check\n`)

  const findings: Finding[] = []
  const missingFiles: { serviceId: number; slug: string; imageUrl: string }[] = []

  for (const service of services) {
    const imageIssue = checkImageUrl(service.imageUrl)
    if (imageIssue) {
      findings.push({ serviceId: service.id, slug: service.slug, field: 'imageUrl', value: service.imageUrl ?? '', reason: imageIssue, fix: null })
    } else if (service.imageUrl) {
      const exists = await checkFileExists(service.imageUrl)
      if (!exists) missingFiles.push({ serviceId: service.id, slug: service.slug, imageUrl: service.imageUrl })
    }

    const urlFields: [string, string[]][] = [
      ['serviceUrls', service.serviceUrls],
      ['tosUrls', service.tosUrls],
      ['onionUrls', service.onionUrls],
      ['i2pUrls', service.i2pUrls],
    ]

    for (const [field, urls] of urlFields) {
      for (const finding of checkUrls(urls)) {
        findings.push({ serviceId: service.id, slug: service.slug, field, ...finding })
      }
    }
  }

  // --- Report ---

  const allIssues = findings.length + missingFiles.length

  if (allIssues === 0) {
    console.log('✅ No malicious or invalid data found.\n')
    return
  }

  console.log(`⚠️  Found ${allIssues} issue(s):\n`)

  const byService = new Map<number, Finding[]>()
  for (const f of findings) {
    const list = byService.get(f.serviceId) ?? []
    list.push(f)
    byService.set(f.serviceId, list)
  }

  for (const [serviceId, serviceFindings] of byService) {
    const first = serviceFindings[0]!
    console.log(`  Service: ${first.slug} (id=${serviceId})`)
    for (const f of serviceFindings) {
      const action = f.fix ? `→ fix: ${f.fix}` : '→ remove'
      console.log(`    [${f.field}] ${f.reason}`)
      console.log(`      value:  ${f.value}`)
      console.log(`      action: ${f.field === 'imageUrl' ? '→ clear + hide service' : action}`)
    }
    console.log()
  }

  if (missingFiles.length > 0) {
    console.log(`⚠️  Missing image files:\n`)
    for (const { slug, serviceId, imageUrl } of missingFiles) {
      console.log(`  Service: ${slug} (id=${serviceId}) — ${imageUrl} → clear + hide service`)
    }
    console.log()
  }

  if (DRY_RUN) {
    console.log('ℹ️  Run with --fix to apply changes.\n')
    return
  }

  // --- Fix ---

  let fixed = 0

  // Suspicious imageUrl — hide service and add internal note
  const suspiciousImageFindings = findings.filter((f) => f.field === 'imageUrl')
  const suspiciousServiceIds = new Set([
    ...suspiciousImageFindings.map((f) => f.serviceId),
    ...missingFiles.map((f) => f.serviceId),
  ])

  for (const serviceId of suspiciousServiceIds) {
    const serviceFindings = [
      ...suspiciousImageFindings.filter((f) => f.serviceId === serviceId),
      ...missingFiles.filter((f) => f.serviceId === serviceId).map((f) => ({
        field: 'imageUrl',
        value: f.imageUrl,
        reason: 'file does not exist on disk',
        fix: null,
      })),
    ]

    const noteLines = [
      '**[Automated Security Scan]** Suspicious image data detected:',
      '',
      ...serviceFindings.map((f) => `- \`${f.field}\`: ${f.reason}\n  Value: \`${f.value}\``),
      '',
      `Detected at: ${new Date().toISOString()}`,
    ]

    await prisma.service.update({
      where: { id: serviceId },
      data: {
        imageUrl: null,
        serviceVisibility: 'HIDDEN',
        internalNotes: { create: { content: noteLines.join('\n') } },
      },
    })
    console.log(`  ✔ Hidden service id=${serviceId}, cleared imageUrl, added internal note`)
    fixed++
  }

  // URL array issues — fix typos, remove unfixable entries
  const urlArrayFindings = findings.filter((f) => f.field !== 'imageUrl')

  if (urlArrayFindings.length > 0) {
    const affectedServiceIds = [...new Set(urlArrayFindings.map((f) => f.serviceId))]

    for (const serviceId of affectedServiceIds) {
      const service = services.find((s) => s.id === serviceId)!
      const fieldFindings = (field: string) => urlArrayFindings.filter((f) => f.serviceId === serviceId && f.field === field)

      await prisma.service.update({
        where: { id: serviceId },
        data: {
          serviceUrls: fixUrlArray(service.serviceUrls, fieldFindings('serviceUrls')),
          tosUrls: fixUrlArray(service.tosUrls, fieldFindings('tosUrls')),
          onionUrls: fixUrlArray(service.onionUrls, fieldFindings('onionUrls')),
          i2pUrls: fixUrlArray(service.i2pUrls, fieldFindings('i2pUrls')),
        },
      })

      const fixed_count = urlArrayFindings.filter((f) => f.serviceId === serviceId && f.fix).length
      const removed_count = urlArrayFindings.filter((f) => f.serviceId === serviceId && !f.fix).length
      const parts = [
        fixed_count > 0 ? `${fixed_count} typo(s) corrected` : '',
        removed_count > 0 ? `${removed_count} removed` : '',
      ].filter(Boolean).join(', ')

      console.log(`  ✔ Fixed URL arrays for service id=${serviceId} (${parts})`)
      fixed++
    }
  }

  console.log(`\n✅ Fixed ${fixed} service(s).\n`)
}

main()
  .catch((e) => {
    console.error('Script failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
