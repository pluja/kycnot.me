import { reclassifyServiceProof } from '../src/lib/commentProof'
import { prisma } from '../src/lib/prisma'

// Re-reads every service's live evidence with the current classifier. Run after deploying a classifier change:
// npx tsx --env-file=.env scripts/reclassify-proof.ts
const services = await prisma.service.findMany({
  where: { comments: { some: { evidence: { some: { removedAt: null } } } } },
  select: { id: true },
})
let changed = 0
for (const service of services) changed += await reclassifyServiceProof(service.id)
console.info(`Reclassified ${String(changed)} pieces of evidence across ${String(services.length)} services`)
await prisma.$disconnect()
