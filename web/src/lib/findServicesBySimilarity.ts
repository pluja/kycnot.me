import { z } from 'astro/zod'

import { prisma } from './prisma'

export async function findServicesBySimilarity(value: string, similarityThreshold = 0.01) {
  const data = await prisma.$queryRaw`
      SELECT id, similarity(name, ${value}) AS similarity_score
      FROM "Service"
      WHERE similarity(name, ${value}) >= ${similarityThreshold}
      ORDER BY similarity(name, ${value}) desc`

  const schema = z.array(z.object({ id: z.number(), similarity_score: z.number() }))
  const parsedData = schema.parse(data)

  return parsedData.map(({ id, similarity_score }) => ({ id, similarityScore: similarity_score }))
}
