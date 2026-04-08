/* eslint-disable no-console */
/**
 * Scans the database for services with malicious or invalid data introduced
 * via attacks on the /_image endpoint or file upload abuse. Reports findings
 * and optionally removes/fixes bad entries.
 *
 * Usage:
 *   npx tsx scripts/cleanup-malicious-data.ts               # dry run (report only)
 *   npx tsx scripts/cleanup-malicious-data.ts --fix         # apply fixes (DB + disk)
 *   npx tsx scripts/cleanup-malicious-data.ts --disk-only   # scan/fix disk files only (no DB)
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const DRY_RUN = !process.argv.includes('--fix')
const DISK_ONLY = process.argv.includes('--disk-only')

const SAFE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.avif', '.webp', '.gif', '.svg', '.ico', '.watermark'])
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
const MANGLED_PROTOCOL_RE = /^([a-zA-Z]{2,10})([:/]+)(.*)/

type UrlFinding = {
  value: string
  reason: string
  fix: string | null  // corrected URL if fixable, null if should be removed
}

type Finding = UrlFinding & {
  serviceId: number
  slug: string
  field: string
}

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
        reason: 'invalid URL (unparseable)',
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

async function* walkDir(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkDir(fullPath)
    } else if (entry.isFile()) {
      yield fullPath
    }
  }
}

async function scanUploadDirectory(): Promise<string[]> {
  const uploadDir = process.env.UPLOAD_DIR ?? './local_uploads'
  const basePath = path.isAbsolute(uploadDir) ? uploadDir : path.join(process.cwd(), uploadDir)

  try {
    await fs.access(basePath)
  } catch {
    return []
  }

  const maliciousFiles: string[] = []
  for await (const filePath of walkDir(basePath)) {
    const ext = path.extname(filePath).toLowerCase()
    if (ext && !SAFE_IMAGE_EXTENSIONS.has(ext)) {
      maliciousFiles.push(filePath)
    }
  }
  return maliciousFiles
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

async function scanAndDeleteMaliciousFiles() {
  console.log('\n🔍 Scanning upload directory for non-image files...')
  console.log(DRY_RUN ? '   Mode: DRY RUN (use --fix to apply changes)\n' : '   Mode: FIX\n')

  const maliciousFiles = await scanUploadDirectory()

  if (maliciousFiles.length === 0) {
    console.log('✅ No non-image files found in upload directory.\n')
    return
  }

  console.log(`⚠️  Found ${String(maliciousFiles.length)} non-image file(s):\n`)
  for (const filePath of maliciousFiles) {
    const ext = path.extname(filePath)
    console.log(`  ${filePath} (${ext}) → delete`)
  }
  console.log()

  if (DRY_RUN) {
    console.log('ℹ️  Run with --disk-only --fix to delete these files.\n')
    return
  }

  let deleted = 0
  for (const filePath of maliciousFiles) {
    try {
      await fs.unlink(filePath)
      console.log(`  ✔ Deleted ${filePath}`)
      deleted++
    } catch (e) {
      console.error(`  ✘ Failed to delete ${filePath}: ${String(e)}`)
    }
  }
  console.log(`\n✅ ${String(deleted)} file(s) deleted.\n`)
}

async function main() {
  if (DISK_ONLY) {
    await scanAndDeleteMaliciousFiles()
    return
  }

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  try {
    console.log('\n🔍 Scanning database for malicious/invalid data...')
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

    console.log(`   Found ${String(services.length)} services to check\n`)

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

    console.log(allIssues === 0
      ? '✅ No malicious or invalid database data found.\n'
      : `⚠️  Found ${String(allIssues)} database issue(s):\n`)

    const byService = new Map<number, Finding[]>()
    for (const f of findings) {
      const list = byService.get(f.serviceId) ?? []
      list.push(f)
      byService.set(f.serviceId, list)
    }

    for (const [serviceId, serviceFindings] of byService) {
      const first = serviceFindings[0]
      if (!first) continue
      console.log(`  Service: ${first.slug} (id=${String(serviceId)})`)
      for (const f of serviceFindings) {
        const action = f.fix ? `→ fix: ${f.fix}` : '→ remove'
        console.log(`    [${f.field}] ${f.reason}`)
        console.log(`      value:  ${f.value}`)
        console.log(`      action: ${f.field === 'imageUrl' ? '→ clear + hide service' : action}`)
      }
      console.log()
    }

    if (missingFiles.length > 0) {
      console.log('⚠️  Missing image files:\n')
      for (const { slug, serviceId, imageUrl } of missingFiles) {
        console.log(`  Service: ${slug} (id=${String(serviceId)}) — ${imageUrl} → clear + hide service`)
      }
      console.log()
    }

    // --- Disk scan for non-image files in upload directory ---

    const maliciousFiles = await scanUploadDirectory()

    if (maliciousFiles.length > 0) {
      console.log(`⚠️  Found ${String(maliciousFiles.length)} non-image file(s) in upload directory:\n`)
      for (const filePath of maliciousFiles) {
        const ext = path.extname(filePath)
        console.log(`  ${filePath} (${ext}) → delete`)
      }
      console.log()
    }

    if (DRY_RUN) {
      const totalIssues = allIssues + maliciousFiles.length
      if (totalIssues > 0) {
        console.log(`ℹ️  Found ${String(totalIssues)} total issue(s). Run with --fix to apply changes.\n`)
      }
      return
    }

    // --- Fix ---

    let fixed = 0

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
      console.log(`  ✔ Hidden service id=${String(serviceId)}, cleared imageUrl, added internal note`)
      fixed++
    }

    const urlArrayFindings = findings.filter((f) => f.field !== 'imageUrl')

    if (urlArrayFindings.length > 0) {
      const affectedServiceIds = [...new Set(urlArrayFindings.map((f) => f.serviceId))]

      for (const serviceId of affectedServiceIds) {
        const service = services.find((s) => s.id === serviceId)
        if (!service) continue
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
          fixed_count > 0 ? `${String(fixed_count)} typo(s) corrected` : '',
          removed_count > 0 ? `${String(removed_count)} removed` : '',
        ].filter(Boolean).join(', ')

        console.log(`  ✔ Fixed URL arrays for service id=${String(serviceId)} (${parts})`)
        fixed++
      }
    }

    // --- Delete non-image files from upload directory ---

    let deletedFiles = 0
    for (const filePath of maliciousFiles) {
      try {
        await fs.unlink(filePath)
        console.log(`  ✔ Deleted ${filePath}`)
        deletedFiles++
      } catch (e) {
      console.error(`  ✘ Failed to delete ${filePath}: ${String(e)}`)
    }
  }

    const summaryParts = [
      fixed > 0 ? `${String(fixed)} service(s) fixed` : '',
      deletedFiles > 0 ? `${String(deletedFiles)} file(s) deleted` : '',
    ].filter(Boolean).join(', ')

    console.log(`\n✅ ${summaryParts || 'No changes needed'}.\n`)
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((e: unknown) => {
    console.error('Script failed:', e)
    process.exit(1)
  })
